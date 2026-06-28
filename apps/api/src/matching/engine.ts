import { Order, OrderStatus, Prisma, Side } from "@prisma/client";
import { io } from "../lib/socket";

function nextStatus(filled: number, quantity: number): OrderStatus {
  return filled >= quantity ? OrderStatus.FILLED : OrderStatus.PARTIAL;
}

function tradeMeta(matchedOrderId: string, fillQty: number, tradePrice: number) {
  return {
    matchedOrderId,
    fillQty,
    tradePrice
  };
}

async function updateBuyerPosition(
  tx: Prisma.TransactionClient,
  order: Pick<Order, "userId" | "marketId" | "outcome">,
  fillQty: number,
  tradePrice: number
) {
  const position = await tx.position.findUnique({
    where: {
      userId_marketId_outcome: {
        userId: order.userId,
        marketId: order.marketId,
        outcome: order.outcome
      }
    }
  });

  if (!position) {
    await tx.position.create({
      data: {
        userId: order.userId,
        marketId: order.marketId,
        outcome: order.outcome,
        shares: fillQty,
        avgPrice: new Prisma.Decimal(tradePrice)
      }
    });
    return;
  }

  const nextShares = position.shares + fillQty;
  const nextAvgPrice =
    nextShares === 0
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(position.shares)
          .times(position.avgPrice)
          .plus(new Prisma.Decimal(fillQty).times(tradePrice))
          .div(nextShares);

  await tx.position.update({
    where: {
      userId_marketId_outcome: {
        userId: order.userId,
        marketId: order.marketId,
        outcome: order.outcome
      }
    },
    data: {
      shares: nextShares,
      avgPrice: nextAvgPrice
    }
  });
}

async function updateSellerPosition(
  tx: Prisma.TransactionClient,
  order: Pick<Order, "userId" | "marketId" | "outcome">,
  fillQty: number
) {
  await tx.position.upsert({
    where: {
      userId_marketId_outcome: {
        userId: order.userId,
        marketId: order.marketId,
        outcome: order.outcome
      }
    },
    create: {
      userId: order.userId,
      marketId: order.marketId,
      outcome: order.outcome,
      shares: -fillQty,
      avgPrice: new Prisma.Decimal(0)
    },
    update: {
      shares: {
        decrement: fillQty
      }
    }
  });
}

async function executeTrade(
  tx: Prisma.TransactionClient,
  newOrder: Order,
  matchedOrder: Order,
  fillQty: number
) {
  const tradePrice = matchedOrder.price;
  const amount = BigInt(tradePrice) * BigInt(fillQty);
  const buyerOrder = newOrder.side === Side.BUY ? newOrder : matchedOrder;
  const sellerOrder = newOrder.side === Side.SELL ? newOrder : matchedOrder;

  const buyerWallet = await tx.wallet.findUniqueOrThrow({
    where: { userId: buyerOrder.userId }
  });
  const sellerWallet = await tx.wallet.findUniqueOrThrow({
    where: { userId: sellerOrder.userId }
  });

  const buyerReservedAfter = buyerWallet.reserved - amount;
  const sellerAvailableAfter = sellerWallet.available + amount;

  await tx.wallet.update({
    where: { userId: buyerOrder.userId },
    data: {
      reserved: buyerReservedAfter
    }
  });

  await tx.wallet.update({
    where: { userId: sellerOrder.userId },
    data: {
      available: sellerAvailableAfter
    }
  });

  await updateBuyerPosition(tx, buyerOrder, fillQty, tradePrice);
  await updateSellerPosition(tx, sellerOrder, fillQty);

  const newOrderFilled = newOrder.filled + fillQty;
  const matchedOrderFilled = matchedOrder.filled + fillQty;
  const newOrderStatus = nextStatus(newOrderFilled, newOrder.quantity);
  const matchedOrderStatus = nextStatus(matchedOrderFilled, matchedOrder.quantity);

  await tx.order.update({
    where: { id: newOrder.id },
    data: {
      filled: newOrderFilled,
      status: newOrderStatus
    }
  });

  await tx.order.update({
    where: { id: matchedOrder.id },
    data: {
      filled: matchedOrderFilled,
      status: matchedOrderStatus
    }
  });

  await tx.ledgerEntry.create({
    data: {
      userId: buyerOrder.userId,
      type: "TRADE_DEBIT",
      amount,
      before: buyerWallet.reserved,
      after: buyerReservedAfter,
      meta: tradeMeta(matchedOrder.id, fillQty, tradePrice)
    }
  });

  await tx.ledgerEntry.create({
    data: {
      userId: sellerOrder.userId,
      type: "TRADE_CREDIT",
      amount,
      before: sellerWallet.available,
      after: sellerAvailableAfter,
      meta: tradeMeta(matchedOrder.id, fillQty, tradePrice)
    }
  });

  const buyerFilled = buyerOrder.id === newOrder.id ? newOrderFilled : matchedOrderFilled;
  const buyerStatus = buyerOrder.id === newOrder.id ? newOrderStatus : matchedOrderStatus;
  const sellerFilled = sellerOrder.id === newOrder.id ? newOrderFilled : matchedOrderFilled;
  const sellerStatus = sellerOrder.id === newOrder.id ? newOrderStatus : matchedOrderStatus;

  io.to(`market:${buyerOrder.marketId}`).emit("price-update", {
    marketId: buyerOrder.marketId,
    outcome: buyerOrder.outcome,
    price: tradePrice,
    quantity: fillQty,
    timestamp: new Date().toISOString()
  });

  io.to(`user:${buyerOrder.userId}`).emit("order-update", {
    orderId: buyerOrder.id,
    status: buyerStatus,
    filled: buyerFilled,
    fillQty,
    tradePrice
  });

  io.to(`user:${sellerOrder.userId}`).emit("order-update", {
    orderId: sellerOrder.id,
    status: sellerStatus,
    filled: sellerFilled,
    fillQty,
    tradePrice
  });

  io.to(`user:${buyerOrder.userId}`).emit("wallet-update", {
    available: buyerReservedAfter.toString(),
    type: "TRADE_DEBIT"
  });

  io.to(`user:${sellerOrder.userId}`).emit("wallet-update", {
    available: sellerAvailableAfter.toString(),
    type: "TRADE_CREDIT"
  });
}

export async function matchOrder(newOrderId: string, tx: Prisma.TransactionClient): Promise<void> {
  const newOrder = await tx.order.findUnique({
    where: { id: newOrderId }
  });

  if (!newOrder || newOrder.status === OrderStatus.FILLED) {
    return;
  }

  let currentNewOrder = newOrder;
  let remainingNew = currentNewOrder.quantity - currentNewOrder.filled;

  while (remainingNew > 0) {
    const matchedOrder = await tx.order.findFirst({
      where: {
        marketId: currentNewOrder.marketId,
        outcome: currentNewOrder.outcome,
        side: currentNewOrder.side === Side.BUY ? Side.SELL : Side.BUY,
        status: { in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
        price:
          currentNewOrder.side === Side.BUY
            ? { lte: currentNewOrder.price }
            : { gte: currentNewOrder.price }
      },
      orderBy:
        currentNewOrder.side === Side.BUY
          ? [{ price: "asc" }, { createdAt: "asc" }]
          : [{ price: "desc" }, { createdAt: "asc" }]
    });

    if (!matchedOrder) {
      break;
    }

    const remainingMatched = matchedOrder.quantity - matchedOrder.filled;

    if (remainingMatched <= 0) {
      await tx.order.update({
        where: { id: matchedOrder.id },
        data: { status: OrderStatus.FILLED }
      });
      continue;
    }

    const fillQty = Math.min(remainingNew, remainingMatched);
    await executeTrade(tx, currentNewOrder, matchedOrder, fillQty);

    currentNewOrder = {
      ...currentNewOrder,
      filled: currentNewOrder.filled + fillQty,
      status: nextStatus(currentNewOrder.filled + fillQty, currentNewOrder.quantity)
    };
    remainingNew = currentNewOrder.quantity - currentNewOrder.filled;
  }
}

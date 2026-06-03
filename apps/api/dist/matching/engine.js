"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchOrder = matchOrder;
const client_1 = require("@prisma/client");
function nextStatus(filled, quantity) {
    return filled >= quantity ? client_1.OrderStatus.FILLED : client_1.OrderStatus.PARTIAL;
}
function tradeMeta(matchedOrderId, fillQty, tradePrice) {
    return {
        matchedOrderId,
        fillQty,
        tradePrice
    };
}
async function updateBuyerPosition(tx, order, fillQty, tradePrice) {
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
                avgPrice: new client_1.Prisma.Decimal(tradePrice)
            }
        });
        return;
    }
    const nextShares = position.shares + fillQty;
    const nextAvgPrice = nextShares === 0
        ? new client_1.Prisma.Decimal(0)
        : new client_1.Prisma.Decimal(position.shares)
            .times(position.avgPrice)
            .plus(new client_1.Prisma.Decimal(fillQty).times(tradePrice))
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
async function updateSellerPosition(tx, order, fillQty) {
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
            avgPrice: new client_1.Prisma.Decimal(0)
        },
        update: {
            shares: {
                decrement: fillQty
            }
        }
    });
}
async function executeTrade(tx, newOrder, matchedOrder, fillQty) {
    const tradePrice = matchedOrder.price;
    const amount = BigInt(tradePrice) * BigInt(fillQty);
    const buyerOrder = newOrder.side === client_1.Side.BUY ? newOrder : matchedOrder;
    const sellerOrder = newOrder.side === client_1.Side.SELL ? newOrder : matchedOrder;
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
    await tx.order.update({
        where: { id: newOrder.id },
        data: {
            filled: newOrderFilled,
            status: nextStatus(newOrderFilled, newOrder.quantity)
        }
    });
    await tx.order.update({
        where: { id: matchedOrder.id },
        data: {
            filled: matchedOrderFilled,
            status: nextStatus(matchedOrderFilled, matchedOrder.quantity)
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
}
async function matchOrder(newOrderId, tx) {
    const newOrder = await tx.order.findUnique({
        where: { id: newOrderId }
    });
    if (!newOrder || newOrder.status === client_1.OrderStatus.FILLED) {
        return;
    }
    let currentNewOrder = newOrder;
    let remainingNew = currentNewOrder.quantity - currentNewOrder.filled;
    while (remainingNew > 0) {
        const matchedOrder = await tx.order.findFirst({
            where: {
                marketId: currentNewOrder.marketId,
                outcome: currentNewOrder.outcome,
                side: currentNewOrder.side === client_1.Side.BUY ? client_1.Side.SELL : client_1.Side.BUY,
                status: { in: [client_1.OrderStatus.OPEN, client_1.OrderStatus.PARTIAL] },
                price: currentNewOrder.side === client_1.Side.BUY
                    ? { lte: currentNewOrder.price }
                    : { gte: currentNewOrder.price }
            },
            orderBy: currentNewOrder.side === client_1.Side.BUY
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
                data: { status: client_1.OrderStatus.FILLED }
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

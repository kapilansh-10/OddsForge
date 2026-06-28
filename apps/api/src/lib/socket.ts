import { Server } from "socket.io";

export const io = new Server({
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("join-market", ({ marketId }: { marketId?: string } = {}) => {
    if (!marketId) {
      return;
    }

    socket.join(`market:${marketId}`);
  });

  socket.on("leave-market", ({ marketId }: { marketId?: string } = {}) => {
    if (!marketId) {
      return;
    }

    socket.leave(`market:${marketId}`);
  });

  socket.on("join-user", ({ userId }: { userId?: string } = {}) => {
    if (!userId) {
      return;
    }

    socket.join(`user:${userId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

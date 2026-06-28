import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import { io } from "./lib/socket";
import authRoutes from "./routes/auth";
import marketRoutes from "./routes/markets";
import orderRoutes from "./routes/orders";
import walletRoutes from "./routes/wallet";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
export const server = http.createServer(app);

io.attach(server);

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/markets", marketRoutes);
app.use("/orders", orderRoutes);
app.use("/wallet", walletRoutes);

server.listen(port, () => {
  console.log(`OddsForge API listening on port ${port}`);
});

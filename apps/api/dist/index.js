"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("./routes/auth"));
const markets_1 = __importDefault(require("./routes/markets"));
const orders_1 = __importDefault(require("./routes/orders"));
const wallet_1 = __importDefault(require("./routes/wallet"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/auth", auth_1.default);
app.use("/markets", markets_1.default);
app.use("/orders", orders_1.default);
app.use("/wallet", wallet_1.default);
app.listen(port, () => {
    console.log(`OddsForge API listening on port ${port}`);
});

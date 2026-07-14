// board-port — die EINE BoardPort-Instanz der App (HTTP-Client gegen /api/v1/boards).
import { createBoardClient } from "../board-client.js";

export const boardPort = createBoardClient();

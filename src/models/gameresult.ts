import { Player } from "./player";
import { HistoryMoveEntry } from "./history-move-entry";
import { Turn } from "./turn";

export class GameResult {
    public player1: Player;
    public player2: Player;
    public winner: Player;
    public history: Turn[];
    public points: number;
}

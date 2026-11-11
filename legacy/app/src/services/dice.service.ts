import { Helper } from "../helper/helper";

export class DiceService {
    public roll(): number {
        return Helper.getRandomInt(1, 6);
    }
}

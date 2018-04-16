export class DiceService {
    public roll(): number {
        return this.getRandomInt(1, 6);
    }
    private getRandomInt(min, max): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

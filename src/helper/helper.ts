export class Helper {
    public static timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public static getRandomInt(min, max): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

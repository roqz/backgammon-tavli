export class Helper {
    public static timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

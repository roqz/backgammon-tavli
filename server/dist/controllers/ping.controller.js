"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
class PingController {
    getRoutes() {
        let router = express_1.default.Router();
        // '/api/users/:id'
        router.get('/', [], (req, res, next) => {
            this.get(req, res, next);
        });
        return router;
    }
    get(req, res, next) {
        console.log(req.params.id);
        return res.status(200).send("Application is working!");
        // return res.status(200).json({msg: 'get_called'})
    }
}
var pingRouter = new PingController();
exports.default = pingRouter.getRoutes();
//# sourceMappingURL=ping.controller.js.map
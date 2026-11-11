import express, { NextFunction, Request, Response, Router } from "express";
class PingController {
    getRoutes(): Router {
        let router = express.Router();
        // '/api/users/:id'
        router.get('/', [], (req: Request, res: Response, next: NextFunction) => {
            this.get(req, res, next);
        });
        return router;
    }

    get(req: Request, res: Response, next: NextFunction): any {
        console.log(req.params.id)
        return res.status(200).send("Application is working!");
        // return res.status(200).json({msg: 'get_called'})
    }
}
var pingRouter = new PingController();
export default pingRouter.getRoutes();
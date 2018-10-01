import express, { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import PingController from "./controllers/ping.controller";
require('dotenv').config();
var cors = require('cors')

class App {

    // ref to Express instance
    public express: express.Application;

    //Run configuration methods on the Express instance.
    constructor() {
        this.express = express();
        this.middleware();
        this.routes();
        this.setupFirebase();
    }

    // Configure Express middleware.
    private middleware(): void {
        this.express.use(cors());
        //   this.express.use(logger('dev'));
        //   this.express.use(bodyParser.json());
        //   this.express.use(bodyParser.urlencoded({ extended: false }));
    }

    // Configure API endpoints.
    private routes(): void {
        this.express.all('*', this.checkUser);
        /* This is just to get up and running, and to make sure what we've got is
         * working so far. This function will change when we start to add more
         * API endpoints */
        let router = express.Router();
        // placeholder route handler
        router.get('/', (req, res, next) => {
            res.json({
                message: 'Hello World! Wha Gwaan?'
            });
        });
        this.express.use('/', router);
        this.express.use('/api/v1/ping', PingController);




    }
    private async checkUser(req: Request, res: Response, next: NextFunction) {
        if (req.path == '/') return next();
        const idToken = req.header('FIREBASE_AUTH_TOKEN');

        // https://firebase.google.com/docs/reference/admin/node/admin.auth.DecodedIdToken
        let decodedIdToken;

        try {
            decodedIdToken = await admin.auth().verifyIdToken(idToken);
        } catch (error) {
            next(error);
            return;
        }

        (req as any).user = decodedIdToken;
        next();
    }
    private setupFirebase() {
        // replace needed: https://stackoverflow.com/questions/39492587/escaping-issue-with-firebase-privatekey-as-a-heroku-config-variable/41044630#41044630
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.PROJECT_ID,
                clientEmail: process.env.CLIENT_EMAIL,
                privateKey: process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
            }),
            databaseURL: process.env.DATABASE_URL
        });
    }
}
export default new App().express;
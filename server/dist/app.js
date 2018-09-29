"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const ping_controller_1 = __importDefault(require("./controllers/ping.controller"));
require('dotenv').config();
class App {
    //Run configuration methods on the Express instance.
    constructor() {
        this.express = express_1.default();
        this.middleware();
        this.routes();
        this.setupFirebase();
    }
    // Configure Express middleware.
    middleware() {
        //   this.express.use(logger('dev'));
        //   this.express.use(bodyParser.json());
        //   this.express.use(bodyParser.urlencoded({ extended: false }));
    }
    // Configure API endpoints.
    routes() {
        this.express.all('*', this.checkUser);
        /* This is just to get up and running, and to make sure what we've got is
         * working so far. This function will change when we start to add more
         * API endpoints */
        let router = express_1.default.Router();
        // placeholder route handler
        router.get('/', (req, res, next) => {
            res.json({
                message: 'Hello World! Wha Gwaan?'
            });
        });
        this.express.use('/', router);
        this.express.use('/api/v1/ping', ping_controller_1.default);
    }
    checkUser(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            if (req.path == '/')
                return next();
            const idToken = req.header('FIREBASE_AUTH_TOKEN');
            // https://firebase.google.com/docs/reference/admin/node/admin.auth.DecodedIdToken
            let decodedIdToken;
            try {
                decodedIdToken = yield firebase_admin_1.default.auth().verifyIdToken(idToken);
            }
            catch (error) {
                next(error);
                return;
            }
            req.user = decodedIdToken;
            next();
        });
    }
    setupFirebase() {
        // replace needed: https://stackoverflow.com/questions/39492587/escaping-issue-with-firebase-privatekey-as-a-heroku-config-variable/41044630#41044630
        firebase_admin_1.default.initializeApp({
            credential: firebase_admin_1.default.credential.cert({
                projectId: process.env.PROJECT_ID,
                clientEmail: process.env.CLIENT_EMAIL,
                privateKey: process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
            }),
            databaseURL: process.env.DATABASE_URL
        });
    }
}
exports.default = new App().express;
//# sourceMappingURL=app.js.map
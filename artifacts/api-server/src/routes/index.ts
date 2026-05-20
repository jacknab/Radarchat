import { Router, type IRouter } from "express";
import healthRouter from "./health";
import uploadRouter from "./upload";
import profileRouter from "./profile";
import adminRouter from "./admin";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploadRouter);
router.use(adminRouter);
router.use(profileRouter);
router.use(aiRouter);

export default router;

import { Response, Router } from 'express';
import { runAsyncWrapper } from '../common/utility/run-async-wrapper';
import { giftsRouter } from './gifts/routes';
import { CommonException } from '../common/errors/common.error';
import { usersRouter } from './users/routes';
import { userController } from './users/controller';
import { filesRouter } from './file/routes';
import { codesRouter } from './codes/routes';
import { codesController } from './codes/controller';
import { dashboardRouter } from './dashboard/routes';

const router = Router()
  .get(
    '/check-health',
    runAsyncWrapper(async (_req: Request, res: Response) => {
      return res.success({ message: "I'm OK. THANKS" });
    }),
  )
  .use('/dashboard', dashboardRouter)
  .use('/files', filesRouter)
  .use('/users', usersRouter)
  .use('/gifts', userController.authorizeUser, giftsRouter)
  .use('/codes', userController.authorizeUser, codesRouter)
  .post('/check-code', runAsyncWrapper(codesController.checkCode));

// 404 Error
router.all('*', (req, res, _next) => {
  console.log('====================== 404 NOT FOUND ======================\n');
  console.log('method:', req.method);
  console.log('httpVersion:', req.httpVersion, req.httpVersionMajor, req.httpVersionMinor);
  console.log('path:', req.path);
  console.log('url:', req.originalUrl, req.baseUrl, req.url);
  console.log('ip:', req.ip, req.ips);
  console.log('====================== 404 NOT FOUND ======================\n');

  return res.status(404).send({ success: false, message: 'Not found' });
});

export { router };

import { Bot, BotError, GrammyError, HttpError } from 'grammy';
import { BOT_TOKEN } from '../config';
import { MyContext } from '../types/types';
import { checkUserMiddleWare, i18n, sessionMiddleware } from './middleware';
import { red } from 'ansis';

const bot = new Bot<MyContext>(BOT_TOKEN);
bot.use(sessionMiddleware);
bot.use(i18n.middleware());

// bot.use((ctx) => {
//   console.log(ctx.channelPost);
//   console.log(ctx.chat);
//   console.log(ctx.from);

//   console.log(ctx.message);

//   return;
// });
bot.use(checkUserMiddleWare);

bot.api.setMyCommands([{ command: 'start', description: 'start' }]);

bot.errorBoundary(async (err, next) => {
  console.error('Error bot errorBoundary', err);
  await next();
});

bot.catch((err) => {
  const e: any = err.error;
  if (e instanceof GrammyError) {
    console.log(red(`Error in request: ${e.description}`));
  } else if (e instanceof HttpError) {
    console.error(`Could not contact Telegram:`, e);
  } else if (err instanceof BotError) {
    const payload = e.payload;
    if (e && e.method === 'editMessageText') {
      err.ctx.api
        .sendMessage(payload.chat_id, payload.text, {
          reply_markup: payload.reply_markup,
        })
        .catch();
      return;
    }
  }
  console.error(`Unknown BotError:`, err);
});

bot.start({
  async onStart(botInfo) {
    console.log(red(`Bot started. ${JSON.stringify(botInfo, null, '\t')}`));
  },
});

export default bot;

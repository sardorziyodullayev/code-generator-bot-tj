import 'dotenv/config';
import { GiftType } from '../../db/models/gifts.model';

interface MessageI {
  start: number;
  codeFake: number;
  codeUsed: number;
  codeReal: number;
  codeWithGift: Record<GiftType, number>;
  codeUsageLimit: number;
  auth: { requestName: number };
}

export const BOT_TOKEN = process.env.BOT_TOKEN as string;
export const FORWARD_MESSAGES_CHANNEL_ID = -1002097144950;

export const messageIds: Record<'tj' | 'ru', MessageI> = {
  tj: {
    start: 6,
    codeWithGift: {
      premium: 59,
      classic: 100,
      standard: 102,
      economy: 104,
      symbolic: 106,
    },
    codeReal: 52, // 52 face code
    codeFake: 52,
    codeUsed: 54,
    codeUsageLimit: 40,
    auth: { requestName: 56 },
  },
  ru: {
    start: 7,
    codeWithGift: {
      premium: 60,
      classic: 101,
      standard: 103,
      economy: 105,
      symbolic: 107,
    },
    auth: { requestName: 57 },
    codeReal: 53, // 53 face code
    codeFake: 53,
    codeUsed: 55,
    codeUsageLimit: 41,
  },
};

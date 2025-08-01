import { CodeModel } from '../../db/models/codes.model';
import { MyContext } from '../types/types';
import bot from '../core/bot';
import { UserModel } from '../../db/models/users.model';
import { contactRequestKeyboard } from '../helpers/keyboard';
import { mainMenu } from '../commands/start.handler';
import { phoneCheck } from '../helpers/util';
import { FORWARD_MESSAGES_CHANNEL_ID, messageIds } from '../config';
import { CodeLogModel } from '../../db/models/code-logs.model';
import { Types } from 'mongoose';
import { SettingsModel } from '../../db/models/settings.model';
import { BotLanguage } from '../core/middleware';

// ⬇️ winners.json ni to'g'ridan-to'g'ri import qilamiz
import winners from '../../config/winners.json';

// ⬇️ nowinners.json (yutuqsiz-lekin-real kodlar ro'yxati)
import nowinners from '../../config/nowinners.json';

// ---- Helpers & Map/Set ----
type GiftTier = 'premium' | 'classic' | 'standard' | 'economy' | 'symbolic';
type NoWinnerRow = { id?: number; code: string };

const norm = (s: string) => (s || '').trim().toUpperCase();
const hyphenize = (s: string) =>
  s.includes('-') ? s : (s.length > 6 ? s.slice(0, 6) + '-' + s.slice(6) : s);

// winners -> Map<code, tier>
const tierMap = new Map<string, GiftTier>();
if ((winners as any)?.tiers) {
  for (const [tier, arr] of Object.entries(
    (winners as any).tiers as Record<string, string[]>
  )) {
    for (const code of arr || []) tierMap.set(norm(code), tier as GiftTier);
  }
}
const getTier = (code: string): GiftTier | null => tierMap.get(norm(code)) ?? null;

// nowinners -> Set<code>  (yutuqsiz-lekin-real)
const realSet = new Set<string>();
if (Array.isArray(nowinners)) {
  for (const code of nowinners as string[]) {
    if (!code) continue;
    realSet.add(norm(hyphenize(code)));
  }
}
const isRealNonWinner = (code: string) => realSet.has(norm(code));

// -------------------------------------------------------

async function registerUserName(ctx: MyContext) {
  const text = ctx.message!.text as string;

  await UserModel.findByIdAndUpdate(
    ctx.session.user.db_id,
    { $set: { firstName: text } },
    { lean: true },
  );

  ctx.session.user.first_name = text;
  ctx.session.user_state = 'REGISTER_PHONE_NUMBER';
  ctx.session.is_editable_image = false;
  ctx.session.is_editable_message = false;

  return await ctx.reply(ctx.i18n.t('auth.requestPhoneNumber'), {
    reply_markup: contactRequestKeyboard(ctx.i18n.t('auth.sendContact')),
    parse_mode: 'HTML',
  });
}

async function registerUserPhoneNumber(ctx: MyContext) {
  const text = ctx.message?.text?.replace('+', '') as string;
  const contact = ctx.message?.contact;
  let phoneNumber = '';

  if (text && phoneCheck(text)) {
    phoneNumber = text;
  } else if (contact && contact.phone_number && phoneCheck(contact.phone_number)) {
    phoneNumber = contact.phone_number;
  } else {
    return await ctx.reply(ctx.i18n.t('validation.invalidPhoneNumber'));
  }

  phoneNumber = phoneNumber.replace('+', '');

  await UserModel.findByIdAndUpdate(
    ctx.session.user.db_id,
    { $set: { phoneNumber } },
    { lean: true },
  );

  ctx.session.user_state = '';
  ctx.session.is_editable_image = false;
  ctx.session.is_editable_message = false;

  const msg = await ctx.reply('.', { reply_markup: { remove_keyboard: true } });
  await ctx.api.deleteMessage(msg.chat.id, msg.message_id);

  return await mainMenu(ctx);
}

async function checkCode(ctx: MyContext) {
  const lang = ctx.i18n.languageCode as BotLanguage;

  // UI cleanup
  if (ctx.session.is_editable_message && ctx.session.main_menu_message) {
    await ctx.api.editMessageReplyMarkup(
      ctx.message!.chat.id,
      ctx.session.main_menu_message.message_id,
      { reply_markup: { inline_keyboard: [] } },
    );
    ctx.session.main_menu_message = undefined;
  }
  ctx.session.is_editable_image = false;
  ctx.session.is_editable_message = false;

  // --- Per-user limit (>= shart)
  const usedCodesCount = await CodeModel.find({
    usedById: ctx.session.user.db_id,
    deletedAt: null,
  }).countDocuments();

  const settings = await SettingsModel.findOne({ deletedAt: null }).lean();
  if (
    settings?.codeLimitPerUser?.status &&
    typeof settings.codeLimitPerUser.value === 'number' &&
    usedCodesCount >= settings.codeLimitPerUser.value
  ) {
    return await ctx.api.forwardMessage(
      ctx.from.id,
      FORWARD_MESSAGES_CHANNEL_ID,
      messageIds[lang].codeUsageLimit,
    );
  }

  // --- Kodni normalize + hyphen
  const raw = (ctx.message?.text ?? '').trim();
  const upper = norm(raw);
  const hyphened = hyphenize(upper);
  const variants = Array.from(new Set([raw, upper, hyphened].filter(Boolean)));

  // --- winners.json: kategoriya
  const tier = getTier(hyphened); // null => yutuqsiz

  // --- DB dan mavjud hujjatni izlaymiz (log va used tekshiruvlar uchun)
  let codeDoc = await CodeModel.findOne(
    {
      $and: [
        { $or: [{ value: variants[0] }, { value: variants[1] }, { value: variants[2] }] },
        { deletedAt: null },
      ],
    },
    { value: 1, isUsed: 1, usedById: 1, giftId: 1, productId: 1 },
  ).lean();

  // Log
  await CodeLogModel.create({
    _id: new Types.ObjectId(),
    userId: ctx.session.user.db_id,
    value: ctx.message!.text,
    codeId: codeDoc ? codeDoc._id : null,
  });

  // === 1) YUTUQLI (winners) ===
  if (tier) {
    // Boshqa user ishlatganmi?
    if (codeDoc?.isUsed && codeDoc.usedById && codeDoc.usedById.toString() !== ctx.session.user.db_id.toString()) {
      return await ctx.api.forwardMessage(
        ctx.from.id,
        FORWARD_MESSAGES_CHANNEL_ID,
        messageIds[lang].codeUsed
      );
    }

    // isUsed=true qilib belgilaymiz (yo'q bo'lsa insert, bor bo'lsa update)
    const nowIso = new Date().toISOString();
    if (!codeDoc) {
      await CodeModel.create({
        value: hyphened,
        version: 2,
        giftId: null, // winners.json bo'yicha forward qilamiz, giftId shart emas
        isUsed: true,
        usedById: ctx.session.user.db_id,
        usedAt: nowIso,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else if (!codeDoc.isUsed) {
      await CodeModel.updateOne(
        { _id: codeDoc._id },
        { $set: { isUsed: true, usedAt: nowIso, usedById: ctx.session.user.db_id } },
        { lean: true, new: true },
      );
    }

    // Kategoriya bo'yicha tayyor postni forward qilish
    return await ctx.api.forwardMessage(
      ctx.from.id,
      FORWARD_MESSAGES_CHANNEL_ID,
      messageIds[lang].codeWithGift[tier],
    );
  }

  // === 2) Yutuqsiz-lekin-real (nowinners.json Set'da) ===
  if (isRealNonWinner(hyphened)) {
    // Agar DB'da allaqachon boshqa user ishlatgan bo'lsa, "codeUsed" yuboramiz
    if (codeDoc?.isUsed && codeDoc.usedById && codeDoc.usedById.toString() !== ctx.session.user.db_id.toString()) {
      return await ctx.api.forwardMessage(
        ctx.from.id,
        FORWARD_MESSAGES_CHANNEL_ID,
        messageIds[lang].codeUsed
      );
    }

    // Hohlasang bu joyda "lazy mark used" qilamiz (ixtiyoriy).
    // Pastdagi ikki qatorni xohlasang ochiq qoldir:
    // if (codeDoc && !codeDoc.isUsed) {
    //   await CodeModel.updateOne({ _id: codeDoc._id }, { $set: { isUsed: true, usedAt: new Date().toISOString(), usedById: ctx.session.user.db_id } });
    // }

    return await ctx.api.forwardMessage(
      ctx.from.id,
      FORWARD_MESSAGES_CHANNEL_ID,
      messageIds[lang].codeReal, // yutuqsiz-real xabar
    );
  }

  // === 3) Umuman yo'q (fake) ===
  return await ctx.api.forwardMessage(
    ctx.from.id,
    FORWARD_MESSAGES_CHANNEL_ID,
    messageIds[lang].codeFake
  );
}

const onMessageHandler = async (ctx: MyContext) => {
  switch (ctx.session.user_state) {
    case 'REGISTER_NAME':
      return await registerUserName(ctx);
    case 'REGISTER_PHONE_NUMBER':
      return await registerUserPhoneNumber(ctx);
    default:
      return await checkCode(ctx);
  }
};

bot.on('message', onMessageHandler);

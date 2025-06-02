import mongoose from 'mongoose';
import { Code, CodeModel } from '../../db/models/codes.model';
import { MyContext } from '../types/types';
import { DocumentType } from '@typegoose/typegoose';
import XLSX from 'xlsx';
import { rm } from 'fs/promises';
import { InputFile } from 'grammy';
import path from 'path';

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const numbs = '0123456789';

function randomString(strLength: number, numLength: number) {
  let result = '';
  for (let i = strLength; i > 0; --i) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  result += '-';
  for (let i = numLength; i > 0; --i) {
    result += numbs[Math.floor(Math.random() * numbs.length)];
  }
  return result;
}

export async function generateCodeCommand(ctx: MyContext) {
  if (ctx.message?.chat.id !== 915007652) {
    return await ctx.reply(`Access denied`);
  }

  const vtCount = 100_000;
  const voCount = 50_000;
  const codesLen = await CodeModel.countDocuments({}, { lean: true });
  const oldCodes = await CodeModel.find({}, { value: 1 }).lean();

  const set = new Set<string>();
  for (const oldCode of oldCodes) {
    set.add(oldCode.value);
  }

  const recursiveCodeGen = (prefix: string): string => {
    let code;
    do {
      code = `${prefix}${randomString(4, 4)}`;
    } while (set.has(code));
    set.add(code);
    return code;
  };

  const vtCodes: DocumentType<Code>[] = [];
  for (let i = 0; i < vtCount; i++) {
    vtCodes.push(new CodeModel({
      id: codesLen + i + 1,
      value: recursiveCodeGen('VT'),
      isUsed: false,
      version: 2,
      deletedAt: null,
    }));
  }

  console.log('Saving VT codes...');
  await CodeModel.bulkSave(vtCodes);
  console.log('VT codes saved.');

  const vtSheet = XLSX.utils.json_to_sheet(
    vtCodes.map(code => ({
      id: code.id,
      code: code.value,
    })),
    { header: ['id', 'code'] }
  );
  const vtWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(vtWb, vtSheet, 'VT Codes');
  const vtFileName = `VT_${new mongoose.Types.ObjectId().toString()}.xlsx`;
  const vtFilePath = path.join(process.cwd(), vtFileName);
  XLSX.writeFileXLSX(vtWb, vtFilePath);

  const voCodes: DocumentType<Code>[] = [];
  for (let i = 0; i < voCount; i++) {
    voCodes.push(new CodeModel({
      id: codesLen + vtCount + i + 1,
      value: recursiveCodeGen('VO'),
      isUsed: false,
      version: 2,
      deletedAt: null,
    }));
  }

  console.log('Saving VO codes...');
  await CodeModel.bulkSave(voCodes);
  console.log('VO codes saved.');

  const voSheet = XLSX.utils.json_to_sheet(
    voCodes.map(code => ({
      id: code.id,
      code: code.value,
    })),
    { header: ['id', 'code'] }
  );
  const voWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(voWb, voSheet, 'VO Codes');
  const voFileName = `VO_${new mongoose.Types.ObjectId().toString()}.xlsx`;
  const voFilePath = path.join(process.cwd(), voFileName);
  XLSX.writeFileXLSX(voWb, voFilePath);

  ctx.session.is_editable_message = true;

  try {
    await ctx.replyWithDocument(new InputFile(vtFilePath, vtFileName), {
      caption: 'VT codes',
      parse_mode: 'HTML',
    });

    await ctx.replyWithDocument(new InputFile(voFilePath, voFileName), {
      caption: 'VO codes',
      parse_mode: 'HTML',
    });

    console.log('Files sent successfully.');
  } catch (err) {
    console.error('Error sending files:', err);
    await ctx.reply('❌ Fayllarni yuborishda xatolik yuz berdi.');
  } finally {
    try {
      await rm(vtFilePath, { force: true });
      await rm(voFilePath, { force: true });
      console.log('Temporary files deleted.');
    } catch (err) {
      console.error('Failed to delete temp files:', err);
    }
  }
}

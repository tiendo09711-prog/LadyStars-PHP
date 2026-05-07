import { Schema, model } from 'mongoose';
export const PrintForm = model('PrintForm', new Schema({ name: { type: String, required: true }, code: { type: String, required: true, unique: true }, type: String, paperSize: { type: String, default: 'A4' }, templateHtml: String, templateData: Schema.Types.Mixed, isActive: { type: Boolean, default: true } }, { timestamps: true }));

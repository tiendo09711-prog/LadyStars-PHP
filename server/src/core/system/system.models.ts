import { Schema, model } from 'mongoose';

export const Permission = model('Permission', new Schema({
  key: { type: String, required: true, unique: true },
  label: { type: String, required: true },
  module: { type: String, required: true },
}, { timestamps: true }));

export const Role = model('Role', new Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  permissions: [{ type: String }],
  isSystem: { type: Boolean, default: false },
}, { timestamps: true }));

export const MenuItem = model('MenuItem', new Schema({
  label: { type: String, required: true },
  path: { type: String, required: true },
  module: { type: String, required: true },
  permission: String,
  icon: String,
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true }));

'use strict';

const CATEGORY_ICON_NAMES = new Set([
  'folder', 'briefcase', 'code', 'user', 'tag', 'bookmark', 'star',
  'heart', 'home', 'work', 'idea', 'book', 'archive',
]);

function requireString(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} metin olmalıdır.`);
  }
  if (maxLength && value.length > maxLength) {
    throw new Error(`${fieldName} en fazla ${maxLength} karakter olabilir.`);
  }
  return value;
}

function requireHexColor(value, fieldName = 'Renk') {
  const color = requireString(value, fieldName, 7).trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new Error(`${fieldName} #RRGGBB biçiminde olmalıdır.`);
  }
  return color.toLowerCase();
}

function requireCategoryIcon(value) {
  const icon = requireString(value || 'folder', 'Kategori ikonu', 32).trim();
  if (!CATEGORY_ICON_NAMES.has(icon)) {
    throw new Error('Desteklenmeyen kategori ikonu.');
  }
  return icon;
}

function validateExternalUrl(value) {
  const parsed = new URL(requireString(value, 'Bağlantı', 2048));
  if (!['https:', 'mailto:'].includes(parsed.protocol)) {
    throw new Error('Yalnızca güvenli HTTPS ve e-posta bağlantıları açılabilir.');
  }
  return parsed.toString();
}

module.exports = {
  CATEGORY_ICON_NAMES,
  requireString,
  requireHexColor,
  requireCategoryIcon,
  validateExternalUrl,
};

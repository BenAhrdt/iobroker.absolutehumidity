/* eslint-disable jsdoc/require-jsdoc */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ADMIN_I18N_DIR = path.join(__dirname, '..', '..', 'admin', 'i18n');
const LANGUAGES = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];
const I18N = loadAdminTranslations();

function loadAdminTranslations() {
	const translations = {};

	for (const language of LANGUAGES) {
		const filePath = path.join(ADMIN_I18N_DIR, `${language}.json`);
		const languageTranslations = readLanguageTranslations(filePath);

		for (const [key, value] of Object.entries(languageTranslations)) {
			translations[key] = translations[key] || {};
			translations[key][language] = value;
		}
	}

	return translations;
}

function readLanguageTranslations(filePath) {
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch {
		return {};
	}
}

function translate(text) {
	return I18N[text] || text;
}

module.exports = {
	I18N,
	translate,
};

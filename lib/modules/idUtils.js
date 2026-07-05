/* eslint-disable jsdoc/require-param-description, jsdoc/reject-any-type */
'use strict';

/**
 * @param {string} name
 * @param {Record<string, any>[]} devices
 */
function createUniqueDeviceId(name, devices) {
	const usedIds = new Set(devices.map(device => device.id));
	const baseId = sanitizeId(name || 'device');
	const id = createUniqueIdFromBase(baseId, usedIds);

	usedIds.add(id);

	return id;
}

/**
 * @param {string} name
 * @param {string} currentId
 * @param {Record<string, any>[]} devices
 */
function createUpdatedDeviceId(name, currentId, devices) {
	return createUniqueDeviceId(
		name,
		devices.filter(device => device.id !== currentId),
	);
}

/**
 * @param {string} baseId
 * @param {Set<string>} usedIds
 */
function createUniqueIdFromBase(baseId, usedIds) {
	let id = baseId;
	let index = 2;

	while (usedIds.has(id)) {
		id = `${baseId}_${index}`;
		index++;
	}

	return id;
}

/**
 * @param {string} value
 */
function sanitizeId(value) {
	const id = replaceGermanUmlauts(String(value))
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

	return id || 'device';
}

/**
 * @param {string} value
 */
function legacySanitizeId(value) {
	const id = String(value)
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

	return id || 'device';
}

/**
 * @param {string} value
 */
function replaceGermanUmlauts(value) {
	return value
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/Ä/g, 'Ae')
		.replace(/Ö/g, 'Oe')
		.replace(/Ü/g, 'Ue')
		.replace(/ß/g, 'ss');
}

module.exports = {
	createUniqueDeviceId,
	createUniqueIdFromBase,
	createUpdatedDeviceId,
	legacySanitizeId,
	replaceGermanUmlauts,
	sanitizeId,
};

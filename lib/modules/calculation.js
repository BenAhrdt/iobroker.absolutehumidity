/* eslint-disable jsdoc/require-param-description */
'use strict';

/**
 * @param {number | null} temperature
 * @param {number | null} relativeHumidity
 */
function calculateAbsoluteHumidity(temperature, relativeHumidity) {
	if (temperature === null || relativeHumidity === null || relativeHumidity < 0 || relativeHumidity > 100) {
		return null;
	}

	const saturationVaporPressure = 6.112 * Math.exp((17.67 * temperature) / (temperature + 243.5));
	const vaporPressure = (relativeHumidity / 100) * saturationVaporPressure;

	return round((216.7 * vaporPressure) / (273.15 + temperature));
}

/**
 * @param {number | null} temperature
 * @param {number | null} relativeHumidity
 */
function calculateDewPointTemperature(temperature, relativeHumidity) {
	if (temperature === null || relativeHumidity === null || relativeHumidity <= 0 || relativeHumidity > 100) {
		return null;
	}

	const alpha = Math.log(relativeHumidity / 100) + (17.62 * temperature) / (243.12 + temperature);

	return round((243.12 * alpha) / (17.62 - alpha));
}

/**
 * @param {number} value
 */
function round(value) {
	return Math.round(value * 100) / 100;
}

module.exports = {
	calculateAbsoluteHumidity,
	calculateDewPointTemperature,
	round,
};

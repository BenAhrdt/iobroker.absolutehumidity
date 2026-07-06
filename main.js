// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns-description, jsdoc/reject-any-type */
'use strict';

const utils = require('@iobroker/adapter-core');
const { calculateAbsoluteHumidity, calculateDewPointTemperature } = require('./lib/modules/calculation');
const {
	DEVICE_ROOT,
	STATE_ABSOLUTE_HUMIDITY,
	STATE_DEW_POINT_TEMPERATURE,
	STATE_RELATIVE_HUMIDITY,
	STATE_TEMPERATURE,
} = require('./lib/modules/constants');
const { AbsoluteHumidityDeviceManagement } = require('./lib/modules/deviceManager');
const {
	createUniqueDeviceId,
	createUniqueIdFromBase,
	createUpdatedDeviceId,
	legacySanitizeId,
	sanitizeId,
} = require('./lib/modules/idUtils');
const { translate } = require('./lib/modules/i18n');

class Absolutehumidity extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options] - Adapter options
	 */
	constructor(options) {
		super({
			...options,
			name: 'absolutehumidity',
		});

		this.deviceManagement = null;
		this.devices = [];
		this.subscribedSourceIds = new Set();

		this.on('ready', this.onReady.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.deviceManagement = new AbsoluteHumidityDeviceManagement(this);
		await this.ensureInfoStates();
		await this.ensureDeviceRootObject();
		await this.loadDevices();
		await this.migrateLegacyDeviceIds();
		await this.rebuildAllDevices();
		await this.refreshSubscriptions();
		await this.updateAllDevices();
	}

	/**
	 * @returns {Array<Record<string, any>>}
	 */
	getConfiguredDevices() {
		return this.devices;
	}

	/**
	 * @param {string} id
	 * @returns {Record<string, any> | undefined}
	 */
	getDeviceById(id) {
		return this.getConfiguredDevices().find(device => device.id === id);
	}

	/**
	 * @param {Record<string, any>} data
	 */
	async addDevice(data) {
		const devices = this.getConfiguredDevices();
		const device = this.normalizeDeviceFormData(data, createUniqueDeviceId(data.name, devices));
		const updatedDevices = [...devices, device];

		await this.ensureDeviceObjects(device);
		await this.updateDeviceValues(device);
		await this.refreshSubscriptions(updatedDevices);
		await this.saveDevices(updatedDevices);
	}

	/**
	 * @param {string} id
	 * @param {Record<string, any>} data
	 */
	async updateDevice(id, data) {
		const oldDevice = this.getDeviceById(id);
		const devices = this.getConfiguredDevices();
		const updatedId = createUpdatedDeviceId(data.name, id, devices);
		const device = this.normalizeDeviceFormData(data, updatedId);
		const updatedDevices = devices.map(existingDevice => (existingDevice.id === id ? device : existingDevice));

		if (oldDevice && oldDevice.id !== device.id) {
			await this.deleteObjectIfExists(this.getDeviceObjectId(oldDevice.id), { recursive: true });
		} else if (oldDevice) {
			await this.deleteObsoleteDeviceStates(oldDevice, device);
		}

		await this.ensureDeviceObjects(device);
		await this.updateDeviceValues(device);
		await this.refreshSubscriptions(updatedDevices);
		await this.saveDevices(updatedDevices);
	}

	/**
	 * @param {string} id
	 */
	async deleteDevice(id) {
		const devices = this.getConfiguredDevices();
		const updatedDevices = devices.filter(device => device.id !== id);

		await this.deleteObjectIfExists(this.getDeviceObjectId(id), { recursive: true });
		await this.refreshSubscriptions(updatedDevices);
		await this.saveDevices(updatedDevices);
	}

	/**
	 * @param {Record<string, any>} data
	 * @param {string} id
	 */
	normalizeDeviceFormData(data, id) {
		return {
			id,
			name: String(data.name || id).trim(),
			isOutdoor: data.isOutdoor === true,
			temperatureStateId: String(data.temperatureStateId || '').trim(),
			relativeHumidityStateId: String(data.relativeHumidityStateId || '').trim(),
			createTemperatureState: data.createTemperatureState !== false,
			createRelativeHumidityState: data.createRelativeHumidityState !== false,
		};
	}

	/**
	 * @param {Record<string, any>} device
	 */
	async validateDeviceSourceIds(device) {
		await this.validateForeignStateId(device.temperatureStateId, 'Temperature state');
		await this.validateForeignStateId(device.relativeHumidityStateId, 'Relative humidity state');
	}

	/**
	 * @param {Record<string, any>} device
	 * @returns {Promise<boolean>}
	 */
	async hasValidDeviceSourceIds(device) {
		const sourceValidation = await this.getDeviceSourceValidation(device);

		return sourceValidation.valid;
	}

	/**
	 * @param {unknown} stateId
	 * @param {string} label
	 */
	async validateForeignStateId(stateId, label) {
		if (await this.isUsableSourceStateId(stateId)) {
			return;
		}

		throw new Error(`${label} "${stateId}" is not a valid number state ID`);
	}

	/**
	 * @param {Record<string, any>} device
	 */
	async getDeviceSourceValidation(device) {
		const temperatureStateValid = await this.isUsableTemperatureStateId(device.temperatureStateId);
		const relativeHumidityStateValid = await this.isUsableRelativeHumidityStateId(device.relativeHumidityStateId);

		return {
			valid: temperatureStateValid && relativeHumidityStateValid,
			temperatureStateValid,
			relativeHumidityStateValid,
		};
	}

	/**
	 * @param {unknown} stateId
	 * @returns {stateId is string}
	 */
	isValidForeignStateId(stateId) {
		return typeof stateId === 'string' && stateId.trim() !== '' && !stateId.endsWith('.');
	}

	/**
	 * @param {unknown} stateId
	 * @returns {Promise<boolean>}
	 */
	async isUsableSourceStateId(stateId) {
		const object = await this.getUsableSourceStateObject(stateId);

		return object?.type === 'state' && object.common?.type === 'number';
	}

	/**
	 * @param {unknown} stateId
	 * @returns {Promise<boolean>}
	 */
	async isUsableTemperatureStateId(stateId) {
		const object = await this.getUsableSourceStateObject(stateId);

		return (
			object?.type === 'state' &&
			object.common?.type === 'number' &&
			this.isSupportedTemperatureUnit(object.common.unit)
		);
	}

	/**
	 * @param {unknown} stateId
	 * @returns {Promise<boolean>}
	 */
	async isUsableRelativeHumidityStateId(stateId) {
		const object = await this.getUsableSourceStateObject(stateId);

		return (
			object?.type === 'state' &&
			object.common?.type === 'number' &&
			this.isSupportedRelativeHumidityUnit(object.common.unit)
		);
	}

	/**
	 * @param {unknown} stateId
	 */
	async getUsableSourceStateObject(stateId) {
		if (!this.isValidForeignStateId(stateId)) {
			return null;
		}

		try {
			return await this.getForeignObjectAsync(stateId);
		} catch (error) {
			this.log.warn(`Cannot validate state ID "${stateId}": ${error.message}`);
			return null;
		}
	}

	/**
	 * @param {unknown} unit
	 */
	isSupportedTemperatureUnit(unit) {
		const normalizedUnit = this.normalizeUnit(unit);

		return (
			normalizedUnit === '' || normalizedUnit === '°c' || normalizedUnit === 'c' || this.isFahrenheitUnit(unit)
		);
	}

	/**
	 * @param {unknown} unit
	 */
	isSupportedRelativeHumidityUnit(unit) {
		const normalizedUnit = this.normalizeUnit(unit);

		return normalizedUnit === '' || normalizedUnit === '%';
	}

	/**
	 * @param {unknown} unit
	 */
	isFahrenheitUnit(unit) {
		const normalizedUnit = this.normalizeUnit(unit);

		return normalizedUnit === '°f' || normalizedUnit === 'f';
	}

	/**
	 * @param {unknown} unit
	 */
	normalizeUnit(unit) {
		return typeof unit === 'string' ? unit.trim().toLowerCase().replace(/\s+/g, '') : '';
	}

	/**
	 * @param {Record<string, any>[]} devices
	 */
	async saveDevices(devices) {
		await this.extendObjectAsync(DEVICE_ROOT, {
			native: {
				devices,
			},
		});
		this.devices = devices;
	}

	async loadDevices() {
		const legacyDevices = Array.isArray(this.config.devices) ? this.config.devices : [];
		const hasLegacyDevicesConfig = Object.prototype.hasOwnProperty.call(this.config, 'devices');

		if (legacyDevices.length) {
			await this.saveDevices(legacyDevices);
			await this.deleteLegacyConfiguredDevices();
			return;
		}

		const deviceRootObject = await this.getObjectAsync(DEVICE_ROOT);
		this.devices = Array.isArray(deviceRootObject?.native?.devices) ? deviceRootObject.native.devices : [];

		if (hasLegacyDevicesConfig) {
			await this.deleteLegacyConfiguredDevices();
		}
	}

	async deleteLegacyConfiguredDevices() {
		const adapterObjectId = `system.adapter.${this.namespace}`;
		const adapterObject = await this.getForeignObjectAsync(adapterObjectId);

		if (!adapterObject) {
			throw new Error(`Could not find adapter object ${adapterObjectId}`);
		}

		if (!Object.prototype.hasOwnProperty.call(adapterObject.native || {}, 'devices')) {
			delete this.config.devices;
			return;
		}

		delete adapterObject.native.devices;

		await this.setForeignObjectAsync(adapterObjectId, adapterObject);
		delete this.config.devices;
	}

	async rebuildAllDevices() {
		for (const device of this.getConfiguredDevices()) {
			await this.ensureDeviceObjects(device);
		}
	}

	async migrateLegacyDeviceIds() {
		const devices = this.getConfiguredDevices();

		if (!devices.length) {
			return;
		}

		const usedLegacyIds = new Set();
		const usedNewIds = new Set();
		const migratedDevices = [];
		const oldIdsToDelete = [];

		for (const device of devices) {
			const legacyId = createUniqueIdFromBase(legacySanitizeId(device.name || device.id), usedLegacyIds);
			const newId = createUniqueIdFromBase(sanitizeId(device.name || device.id), usedNewIds);

			usedLegacyIds.add(legacyId);
			usedNewIds.add(newId);

			if (device.id === legacyId && legacyId !== newId) {
				migratedDevices.push({
					...device,
					id: newId,
				});
				oldIdsToDelete.push(device.id);
			} else {
				migratedDevices.push(device);
			}
		}

		if (!oldIdsToDelete.length) {
			return;
		}

		for (const device of migratedDevices) {
			await this.ensureDeviceObjects(device);
		}

		for (const oldId of oldIdsToDelete) {
			await this.deleteObjectIfExists(this.getDeviceObjectId(oldId), { recursive: true });
		}

		await this.saveDevices(migratedDevices);
	}

	async ensureInfoStates() {
		await this.setObjectNotExistsAsync('info', {
			type: 'channel',
			common: {
				name: 'Information',
			},
			native: {},
		});
	}

	async ensureDeviceRootObject() {
		await this.setObjectNotExistsAsync(DEVICE_ROOT, {
			type: 'folder',
			common: {
				name: 'Devices',
			},
			native: {
				devices: [],
			},
		});
	}

	/**
	 * @param {Record<string, any>} device
	 */
	async ensureDeviceObjects(device) {
		const deviceObjectId = this.getDeviceObjectId(device.id);

		await this.setObjectNotExistsAsync(deviceObjectId, {
			type: 'device',
			common: {
				name: device.name,
			},
			native: {},
		});

		await this.extendObjectAsync(deviceObjectId, {
			common: {
				name: device.name,
			},
			native: {
				temperatureStateId: device.temperatureStateId,
				relativeHumidityStateId: device.relativeHumidityStateId,
				isOutdoor: device.isOutdoor === true,
			},
		});

		await this.ensureStateObject(device, STATE_ABSOLUTE_HUMIDITY, {
			name: translate('Absolute humidity'),
			role: 'value.humidity.absolute',
			unit: 'g/m³',
		});
		await this.ensureStateObject(device, STATE_DEW_POINT_TEMPERATURE, {
			name: translate('Dew point temperature'),
			role: 'value.temperature.dewpoint',
			unit: '°C',
		});

		if (device.createTemperatureState) {
			await this.ensureStateObject(device, STATE_TEMPERATURE, {
				name: translate('Temperature'),
				role: 'value.temperature',
				unit: '°C',
			});
		} else {
			await this.deleteObjectIfExists(`${this.getDeviceObjectId(device.id)}.${STATE_TEMPERATURE}`);
		}

		if (device.createRelativeHumidityState) {
			await this.ensureStateObject(device, STATE_RELATIVE_HUMIDITY, {
				name: translate('Relative humidity'),
				role: 'value.humidity',
				unit: '%',
			});
		} else {
			await this.deleteObjectIfExists(`${this.getDeviceObjectId(device.id)}.${STATE_RELATIVE_HUMIDITY}`);
		}
		await this.deleteObjectIfExists(`${this.getDeviceObjectId(device.id)}.sources`, { recursive: true });
	}

	/**
	 * @param {Record<string, any>} device
	 * @param {string} stateName
	 * @param {{ name: ioBroker.StringOrTranslated; role: string; unit: string }} common
	 */
	async ensureStateObject(device, stateName, common) {
		const stateId = `${this.getDeviceObjectId(device.id)}.${stateName}`;

		await this.setObjectNotExistsAsync(stateId, {
			type: 'state',
			common: {
				name: common.name,
				type: 'number',
				role: common.role,
				read: true,
				write: false,
				unit: common.unit,
			},
			native: {},
		});
		await this.extendObjectAsync(stateId, {
			common: {
				name: common.name,
				type: 'number',
				role: common.role,
				read: true,
				write: false,
				unit: common.unit,
			},
		});
	}

	/**
	 * @param {Record<string, any>} oldDevice
	 * @param {Record<string, any>} newDevice
	 */
	async deleteObsoleteDeviceStates(oldDevice, newDevice) {
		if (oldDevice.createTemperatureState && !newDevice.createTemperatureState) {
			await this.deleteObjectIfExists(`${this.getDeviceObjectId(newDevice.id)}.${STATE_TEMPERATURE}`);
		}

		if (oldDevice.createRelativeHumidityState && !newDevice.createRelativeHumidityState) {
			await this.deleteObjectIfExists(`${this.getDeviceObjectId(newDevice.id)}.${STATE_RELATIVE_HUMIDITY}`);
		}
	}

	/**
	 * @param {string} id
	 * @param {Record<string, unknown>} [options]
	 */
	async deleteObjectIfExists(id, options) {
		const object = await this.getObjectAsync(id);

		if (object) {
			await this.delObjectAsync(id, options);
		}
	}

	/**
	 * @param {Array<Record<string, any>>} [devices]
	 */
	async refreshSubscriptions(devices = this.getConfiguredDevices()) {
		for (const stateId of this.subscribedSourceIds) {
			this.unsubscribeForeignStates(stateId);
		}

		this.subscribedSourceIds.clear();

		for (const device of devices) {
			const sourceValidation = await this.getDeviceSourceValidation(device);

			if (sourceValidation.temperatureStateValid) {
				this.subscribedSourceIds.add(device.temperatureStateId);
			} else {
				this.log.warn(
					`Ignoring unusable temperature state ID for device "${device.name}": ${device.temperatureStateId}`,
				);
			}

			if (sourceValidation.relativeHumidityStateValid) {
				this.subscribedSourceIds.add(device.relativeHumidityStateId);
			} else {
				this.log.warn(
					`Ignoring unusable relative humidity state ID for device "${device.name}": ${device.relativeHumidityStateId}`,
				);
			}
		}

		for (const stateId of this.subscribedSourceIds) {
			try {
				this.subscribeForeignStates(stateId);
			} catch (error) {
				this.log.warn(`Cannot subscribe state ID "${stateId}": ${error.message}`);
			}
		}
	}

	async updateAllDevices() {
		for (const device of this.getConfiguredDevices()) {
			await this.updateDeviceValues(device);
		}
	}

	// If object subscriptions are needed later, enable the constructor hook and call this.subscribeObjects(...).
	// /**
	//  * Is called if a subscribed object changes
	//  *
	//  * @param {string} id - Object ID
	//  * @param {ioBroker.Object | null | undefined} obj - Object
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		this.log.debug(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		if (!state) {
			return;
		}

		const affectedDevices = this.getConfiguredDevices().filter(
			device => device.temperatureStateId === id || device.relativeHumidityStateId === id,
		);

		for (const device of affectedDevices) {
			await this.updateDeviceValues(device);
		}

		if (affectedDevices.length) {
			await this.refreshDeviceManagerDevices();
		}
	}

	async refreshDeviceManagerDevices() {
		if (!this.deviceManagement) {
			return;
		}

		try {
			await this.deviceManagement.refreshDevices();
		} catch (error) {
			this.log.debug(`Cannot refresh Device Manager view: ${error.message}`);
		}
	}

	/**
	 * Is called if a message is sent to this adapter instance.
	 *
	 * @param {ioBroker.Message} obj - Message object
	 */
	onMessage(obj) {
		if (obj.command?.startsWith('dm:')) {
			// Device Manager messages are handled by @iobroker/dm-utils.
			return;
		}

		if (typeof obj === 'object' && obj.message) {
			this.log.debug(`Unhandled message command: ${obj.command}`);
		}
	}

	/**
	 * @param {Record<string, any>} device
	 */
	async updateDeviceValues(device) {
		if (!(await this.hasValidDeviceSourceIds(device))) {
			this.log.warn(`Skipping device "${device.name}" because it has unusable source state IDs`);
			return;
		}

		const temperature = await this.readTemperatureStateAsCelsius(device.temperatureStateId);
		const relativeHumidity = await this.readNumberState(device.relativeHumidityStateId);
		const absoluteHumidity = calculateAbsoluteHumidity(temperature, relativeHumidity);
		const dewPointTemperature = calculateDewPointTemperature(temperature, relativeHumidity);
		const deviceObjectId = this.getDeviceObjectId(device.id);

		if (device.createTemperatureState) {
			await this.setStateChangedAsync(`${deviceObjectId}.${STATE_TEMPERATURE}`, {
				val: temperature,
				ack: true,
			});
		}

		if (device.createRelativeHumidityState) {
			await this.setStateChangedAsync(`${deviceObjectId}.${STATE_RELATIVE_HUMIDITY}`, {
				val: relativeHumidity,
				ack: true,
			});
		}

		await this.setStateChangedAsync(`${deviceObjectId}.${STATE_ABSOLUTE_HUMIDITY}`, {
			val: absoluteHumidity,
			ack: true,
		});
		await this.setStateChangedAsync(`${deviceObjectId}.${STATE_DEW_POINT_TEMPERATURE}`, {
			val: dewPointTemperature,
			ack: true,
		});
	}

	/**
	 * @param {string} stateId
	 */
	async readTemperatureStateAsCelsius(stateId) {
		const temperature = await this.readNumberState(stateId);

		if (temperature === null) {
			return null;
		}

		const object = await this.getUsableSourceStateObject(stateId);

		if (this.isFahrenheitUnit(object?.common?.unit)) {
			return ((temperature - 32) * 5) / 9;
		}

		return temperature;
	}

	/**
	 * @param {string} stateId
	 */
	async readNumberState(stateId) {
		if (!(await this.isUsableSourceStateId(stateId))) {
			this.log.warn(`Cannot read unusable state ID: ${stateId}`);
			return null;
		}

		let state;

		try {
			state = await this.getForeignStateAsync(stateId);
		} catch (error) {
			this.log.warn(`Cannot read state ID "${stateId}": ${error.message}`);
			return null;
		}

		const value = Number(state?.val);

		return Number.isFinite(value) ? value : null;
	}

	/**
	 * @param {string} id
	 */
	getDeviceObjectId(id) {
		return `${DEVICE_ROOT}.${id}`;
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param {() => void} callback - Callback function
	 */
	onUnload(callback) {
		try {
			callback();
		} catch (error) {
			this.log.error(`Error during unloading: ${error.message}`);
			callback();
		}
	}
}

if (require.main !== module) {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options]
	 */
	module.exports = options => new Absolutehumidity(options);
} else {
	new Absolutehumidity();
}

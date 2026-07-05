/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/reject-any-type */
'use strict';

const { DeviceManagement } = require('@iobroker/dm-utils');
const {
	ADAPTER_ICON,
	CARD_HEADER_BACKGROUND,
	STATE_ABSOLUTE_HUMIDITY,
	STATE_DEW_POINT_TEMPERATURE,
	STATE_RELATIVE_HUMIDITY,
	STATE_TEMPERATURE,
} = require('./constants');
const { translate } = require('./i18n');

const STATE_ICONS = {
	temperature: createSvgIcon(`
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
			<path fill="none" stroke="#1976d2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 14.76V5a4 4 0 0 0-8 0v9.76a6 6 0 1 0 8 0Z"/>
			<path fill="#1976d2" d="M10 17.5a2.5 2.5 0 1 1-2-2.45V8a2 2 0 0 1 4 0v7.05a2.5 2.5 0 0 1-2 2.45Z"/>
		</svg>
	`),
	relativeHumidity: createSvgIcon(`
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
			<path fill="#03a9f4" d="M12 2.7 6.6 9.3A8.2 8.2 0 0 0 5 14a7 7 0 0 0 14 0 8.2 8.2 0 0 0-1.6-4.7L12 2.7Z"/>
			<text x="12" y="16" text-anchor="middle" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#fff">%</text>
		</svg>
	`),
	absoluteHumidity: createSvgIcon(`
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
			<path fill="#03a9f4" d="M12 2.7 6.6 9.3A8.2 8.2 0 0 0 5 14a7 7 0 0 0 14 0 8.2 8.2 0 0 0-1.6-4.7L12 2.7Z"/>
			<path fill="rgba(255,255,255,.7)" d="M8.4 14.1c.3 2.1 1.6 3.3 3.4 3.7-2.8.3-5-1.2-5.4-3.6-.2-1.2.2-2.4 1.1-3.5-.1 1.2.2 2.4.9 3.4Z"/>
		</svg>
	`),
	dewPointTemperature: createSvgIcon(`
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
			<path fill="none" stroke="#1976d2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M10 13.9V5a3 3 0 0 0-6 0v8.9a5 5 0 1 0 6 0Z"/>
			<path fill="#1976d2" d="M7 17.6a2.1 2.1 0 0 1-1-4V8a1 1 0 0 1 2 0v5.6a2.1 2.1 0 0 1-1 4Z"/>
			<path fill="#03a9f4" d="M17 6.4 13.7 10a5 5 0 0 0-1.2 3.2 4.5 4.5 0 0 0 9 0 5 5 0 0 0-1.2-3.2L17 6.4Z"/>
		</svg>
	`),
};

const TEMPERATURE_STATE_FILTER =
	"const unit = String(obj.common?.unit || '').trim().toLowerCase().replace(/\\s+/g, ''); return obj.type === 'state' && obj.common?.type === 'number' && (unit === '' || unit === '°c' || unit === 'c' || unit === '°f' || unit === 'f');";
const RELATIVE_HUMIDITY_STATE_FILTER =
	"const unit = String(obj.common?.unit || '').trim().toLowerCase().replace(/\\s+/g, ''); return obj.type === 'state' && obj.common?.type === 'number' && (unit === '' || unit === '%');";

class AbsoluteHumidityDeviceManagement extends DeviceManagement {
	/**
	 * @param {import('../../main')} adapter
	 */
	constructor(adapter) {
		super(adapter, true);
	}

	getInstanceInfo() {
		return {
			apiVersion: 'v3',
			communicationStateId: 'info.deviceManager',
			actions: [
				{
					id: 'addDevice',
					icon: 'add',
					title: {
						en: '+ Add device',
						de: '+ Gerät hinzufügen',
						ru: '+ Добавить устройство',
						pt: '+ Adicionar dispositivo',
						nl: '+ Apparaat toevoegen',
						fr: '+ Ajouter un appareil',
						it: '+ Aggiungi dispositivo',
						es: '+ Añadir dispositivo',
						pl: '+ Dodaj urządzenie',
						uk: '+ Додати пристрій',
						'zh-cn': '+ 添加设备',
					},
					description: translate('Add a temperature and humidity device'),
					color: CARD_HEADER_BACKGROUND,
					backgroundColor: CARD_HEADER_BACKGROUND,
					variant: 'contained',
					style: {
						backgroundColor: CARD_HEADER_BACKGROUND,
						color: '#ffffff',
					},
					handler: async context => {
						const data = await showDeviceForm(context, undefined);

						if (!data) {
							return { refresh: false };
						}

						await this.adapter.addDevice(data);
						return { refresh: true };
					},
				},
			],
		};
	}

	/**
	 * @param {import('@iobroker/dm-utils').DeviceLoadContext<string>} context
	 */
	async loadDevices(context) {
		const devices = this.adapter.getConfiguredDevices();

		context.setTotalDevices(devices.length);

		for (const device of devices) {
			const sourceValidation = await this.adapter.getDeviceSourceValidation(device);

			context.addDevice(createDeviceInfo(this.adapter, device, sourceValidation));
		}
	}
}

/**
 * @param {import('../../main')} adapter
 * @param {Record<string, any>} device
 * @param {{ valid: boolean; temperatureStateValid: boolean; relativeHumidityStateValid: boolean }} sourceValidation
 */
function createDeviceInfo(adapter, device, sourceValidation) {
	return {
		id: device.id,
		name: device.name,
		icon: ADAPTER_ICON,
		backgroundColor: CARD_HEADER_BACKGROUND,
		status: sourceValidation.valid
			? 'connected'
			: {
					connection: 'disconnected',
					warning: translate('Invalid source state'),
				},
		actions: [
			{
				id: 'editDevice',
				icon: 'edit',
				description: translate('Edit device'),
				handler: async (deviceId, context) => {
					const existingDevice = adapter.getDeviceById(deviceId);

					if (!existingDevice) {
						await context.showMessage(translate('Device not found'));
						return { refresh: 'none' };
					}

					const data = await showDeviceForm(context, existingDevice);

					if (!data) {
						return { refresh: 'none' };
					}

					await adapter.updateDevice(deviceId, data);
					return { refresh: 'devices' };
				},
			},
			{
				id: 'deleteDevice',
				icon: 'delete',
				description: translate('Delete device'),
				color: 'secondary',
				confirmation: translate('Delete this device?'),
				handler: async deviceId => {
					await adapter.deleteDevice(deviceId);
					return { refresh: 'devices' };
				},
			},
		],
		customInfo: createDeviceCustomInfo(adapter, device, sourceValidation),
	};
}

/**
 * @param {import('../../main')} adapter
 * @param {Record<string, any>} device
 * @param {{ valid: boolean; temperatureStateValid: boolean; relativeHumidityStateValid: boolean }} sourceValidation
 */
function createDeviceCustomInfo(adapter, device, sourceValidation) {
	return {
		id: device.id,
		schema: {
			type: 'panel',
			innerStyle: {
				marginTop: 0,
				paddingTop: 0,
			},
			items: {
				temperature: createStateInfoItem(
					translate('Temperature'),
					device.createTemperatureState || !sourceValidation.temperatureStateValid
						? `${adapter.getDeviceObjectId(device.id)}.${STATE_TEMPERATURE}`
						: device.temperatureStateId,
					'°C',
					!device.createTemperatureState && sourceValidation.temperatureStateValid,
					STATE_ICONS.temperature,
				),
				relativeHumidity: createStateInfoItem(
					translate('Relative humidity'),
					device.createRelativeHumidityState || !sourceValidation.relativeHumidityStateValid
						? `${adapter.getDeviceObjectId(device.id)}.${STATE_RELATIVE_HUMIDITY}`
						: device.relativeHumidityStateId,
					'%',
					!device.createRelativeHumidityState && sourceValidation.relativeHumidityStateValid,
					STATE_ICONS.relativeHumidity,
				),
				absoluteHumidity: createStateInfoItem(
					translate('Absolute humidity'),
					`${adapter.getDeviceObjectId(device.id)}.${STATE_ABSOLUTE_HUMIDITY}`,
					'g/m³',
					false,
					STATE_ICONS.absoluteHumidity,
				),
				dewPointTemperature: createStateInfoItem(
					translate('Dew point temperature'),
					`${adapter.getDeviceObjectId(device.id)}.${STATE_DEW_POINT_TEMPERATURE}`,
					'°C',
					false,
					STATE_ICONS.dewPointTemperature,
				),
				spacer: {
					type: 'staticText',
					text: '',
					newLine: true,
					xs: 12,
					sm: 12,
					md: 12,
					lg: 12,
					xl: 12,
				},
				spacer2: {
					type: 'staticText',
					text: '',
					newLine: true,
					xs: 12,
					sm: 12,
					md: 12,
					lg: 12,
					xl: 12,
				},
			},
		},
	};
}

/**
 * @param {string} label
 * @param {string} oid
 * @param {string} unit
 * @param {boolean} foreign
 * @param {string} labelIcon
 */
function createStateInfoItem(label, oid, unit, foreign, labelIcon) {
	return {
		type: 'state',
		label,
		labelIcon,
		oid,
		foreign,
		control: 'text',
		readOnly: true,
		unit,
		narrow: false,
		addColon: true,
		newLine: true,
		xs: 12,
		sm: 12,
		md: 12,
		lg: 12,
		xl: 12,
	};
}

/**
 * @param {string} svg
 */
function createSvgIcon(svg) {
	return `data:image/svg+xml;base64,${Buffer.from(svg.replace(/\s+/g, ' ').trim()).toString('base64')}`;
}

/**
 * @param {import('@iobroker/dm-utils').ActionContext} context
 * @param {Record<string, any> | undefined} device
 */
async function showDeviceForm(context, device) {
	return context.showForm(getDeviceFormSchema(), {
		title: device ? translate('Edit device') : translate('Add device'),
		data: device
			? {
					name: device.name,
					temperatureStateId: device.temperatureStateId,
					relativeHumidityStateId: device.relativeHumidityStateId,
					createTemperatureState: device.createTemperatureState,
					createRelativeHumidityState: device.createRelativeHumidityState,
				}
			: {
					name: '',
					temperatureStateId: '',
					relativeHumidityStateId: '',
					createTemperatureState: true,
					createRelativeHumidityState: true,
				},
		buttons: ['apply', 'cancel'],
		minWidth: 520,
		applyDisabledRule: '!data.name || !data.temperatureStateId || !data.relativeHumidityStateId',
	});
}

function getDeviceFormSchema() {
	return {
		type: 'panel',
		items: {
			name: {
				type: 'text',
				label: translate('Name'),
				newLine: true,
				xs: 12,
				sm: 12,
			},
			temperatureStateId: {
				type: 'objectId',
				label: translate('Temperature state'),
				newLine: true,
				xs: 12,
				sm: 12,
				customFilter: {
					type: 'state',
					common: {
						type: 'number',
					},
				},
				filterFunc: TEMPERATURE_STATE_FILTER,
			},
			createTemperatureState: {
				type: 'checkbox',
				label: translate('Create temperature state in adapter'),
				newLine: true,
				xs: 12,
				sm: 12,
			},
			relativeHumidityStateId: {
				type: 'objectId',
				label: translate('Relative humidity state'),
				newLine: true,
				xs: 12,
				sm: 12,
				customFilter: {
					type: 'state',
					common: {
						type: 'number',
					},
				},
				filterFunc: RELATIVE_HUMIDITY_STATE_FILTER,
			},
			createRelativeHumidityState: {
				type: 'checkbox',
				label: translate('Create relative humidity state in adapter'),
				newLine: true,
				xs: 12,
				sm: 12,
			},
		},
	};
}

module.exports = {
	AbsoluteHumidityDeviceManagement,
	createDeviceInfo,
	getDeviceFormSchema,
	showDeviceForm,
};

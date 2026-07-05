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
	loadDevices(context) {
		const devices = this.adapter.getConfiguredDevices();

		context.setTotalDevices(devices.length);

		for (const device of devices) {
			context.addDevice(createDeviceInfo(this.adapter, device));
		}
	}
}

/**
 * @param {import('../../main')} adapter
 * @param {Record<string, any>} device
 */
function createDeviceInfo(adapter, device) {
	return {
		id: device.id,
		name: device.name,
		icon: ADAPTER_ICON,
		backgroundColor: CARD_HEADER_BACKGROUND,
		status: 'connected',
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
		customInfo: createDeviceCustomInfo(adapter, device),
	};
}

/**
 * @param {import('../../main')} adapter
 * @param {Record<string, any>} device
 */
function createDeviceCustomInfo(adapter, device) {
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
					device.createTemperatureState
						? `${adapter.getDeviceObjectId(device.id)}.${STATE_TEMPERATURE}`
						: device.temperatureStateId,
					'°C',
					!device.createTemperatureState,
				),
				relativeHumidity: createStateInfoItem(
					translate('Relative humidity'),
					device.createRelativeHumidityState
						? `${adapter.getDeviceObjectId(device.id)}.${STATE_RELATIVE_HUMIDITY}`
						: device.relativeHumidityStateId,
					'%',
					!device.createRelativeHumidityState,
				),
				absoluteHumidity: createStateInfoItem(
					translate('Absolute humidity'),
					`${adapter.getDeviceObjectId(device.id)}.${STATE_ABSOLUTE_HUMIDITY}`,
					'g/m³',
					false,
				),
				dewPointTemperature: createStateInfoItem(
					translate('Dew point temperature'),
					`${adapter.getDeviceObjectId(device.id)}.${STATE_DEW_POINT_TEMPERATURE}`,
					'°C',
					false,
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
 */
function createStateInfoItem(label, oid, unit, foreign) {
	return {
		type: 'state',
		label,
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

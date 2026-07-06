'use strict';

const { expect } = require('chai');
const { getDevicesSortedByAbsoluteHumidity } = require('./lib/modules/deviceManager');
const { createUpdatedDeviceId } = require('./lib/modules/idUtils');

describe('device ID updates', () => {
	it('should create a new ID when a device is renamed', () => {
		const devices = [{ id: 'living_room', name: 'Living room' }];

		const id = createUpdatedDeviceId('Bedroom', 'living_room', devices);

		expect(id).to.equal('bedroom');
	});

	it('should keep the ID when the sanitized device name does not change', () => {
		const devices = [{ id: 'living_room', name: 'Living room' }];

		const id = createUpdatedDeviceId('Living room', 'living_room', devices);

		expect(id).to.equal('living_room');
	});

	it('should avoid IDs already used by other devices', () => {
		const devices = [
			{ id: 'living_room', name: 'Living room' },
			{ id: 'bedroom', name: 'Bedroom' },
		];

		const id = createUpdatedDeviceId('Bedroom', 'living_room', devices);

		expect(id).to.equal('bedroom_2');
	});
});

describe('device manager sorting', () => {
	it('should sort devices by absolute humidity ascending', async () => {
		const devices = [
			{ id: 'bathroom', name: 'Bathroom' },
			{ id: 'outside', name: 'Outside' },
			{ id: 'living_room', name: 'Living room' },
		];
		const states = new Map([
			['devices.bathroom.absoluteHumidity', { val: 11.2 }],
			['devices.outside.absoluteHumidity', { val: 7.6 }],
			['devices.living_room.absoluteHumidity', { val: 9.4 }],
		]);
		const adapter = {
			getConfiguredDevices: () => devices,
			getDeviceObjectId: id => `devices.${id}`,
			getStateAsync: async id => states.get(id),
			log: {
				debug: () => {},
			},
		};

		const sortedDevices = await getDevicesSortedByAbsoluteHumidity(adapter);

		expect(sortedDevices.map(device => device.id)).to.deep.equal(['outside', 'living_room', 'bathroom']);
	});
});

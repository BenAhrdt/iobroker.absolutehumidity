'use strict';

const { expect } = require('chai');
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

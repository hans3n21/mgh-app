import { describe, expect, it } from 'vitest';
import {
	CHECKBOX_DETAIL_FIELDS,
	CHECKBOX_FIELDS,
	DETAIL_FIELD_BY_CHECKBOX,
	FIELD_LABELS,
	SPEC_PRESETS,
	getFieldsForCategory,
	isCheckedSpecValue,
	isMultilineField,
	shouldRenderDetailField,
} from '../order-presets';
import { getCustomerSheetSections, isCheckboxField } from '../customer-datasheet';

const PICKGUARD_FIELDS = getFieldsForCategory('PICKGUARD', 'pickguard');

describe('Checkbox-Felder mit Detailangabe', () => {
	it('jedes Detailfeld hat eine Checkbox davor, die auch als Checkbox gerendert wird', () => {
		for (const [detail, controller] of Object.entries(CHECKBOX_DETAIL_FIELDS)) {
			expect(CHECKBOX_FIELDS.has(controller), `${controller} fehlt in CHECKBOX_FIELDS`).toBe(true);
			expect(isCheckboxField(controller), `${controller} ist im PDF keine Checkbox`).toBe(true);
			expect(DETAIL_FIELD_BY_CHECKBOX[controller]).toBe(detail);
		}
	});

	it('Checkbox und Detailfeld stehen im selben Preset und haben ein Label', () => {
		for (const [detail, controller] of Object.entries(CHECKBOX_DETAIL_FIELDS)) {
			const presets = Object.values(SPEC_PRESETS).filter((p) =>
				Object.values(p.fields).flat().includes(controller),
			);
			expect(presets.length, `${controller} kommt in keinem Preset vor`).toBeGreaterThan(0);
			for (const preset of presets) {
				expect(Object.values(preset.fields).flat()).toContain(detail);
			}
			expect(FIELD_LABELS[controller] || detail).toBeTruthy();
		}
	});

	it('Detailfeld erscheint nur bei gesetzter Checkbox - oder wenn schon ein Wert drinsteht', () => {
		expect(shouldRenderDetailField('pg_shielding_details', {})).toBe(false);
		expect(shouldRenderDetailField('pg_shielding_details', { pg_shielding: 'Nein' })).toBe(false);
		expect(shouldRenderDetailField('pg_shielding_details', { pg_shielding: 'Ja' })).toBe(true);
		// Altwert/Mail-Vorschlag darf nicht unsichtbar verschwinden
		expect(
			shouldRenderDetailField('pg_shielding_details', { pg_shielding: 'Nein', pg_shielding_details: 'komplett' }),
		).toBe(true);
		// Feld ohne Checkbox davor ist immer sichtbar
		expect(shouldRenderDetailField('pg_model', {})).toBe(true);
	});

	it('erkennt alle Schreibweisen fuer "Ja"', () => {
		for (const value of ['Ja', 'ja', 'JA', 'true', '1', 'yes']) {
			expect(isCheckedSpecValue(value)).toBe(true);
		}
		for (const value of ['', 'Nein', 'nein', '0', 'false']) {
			expect(isCheckedSpecValue(value)).toBe(false);
		}
	});
});

describe('Pickguard-Preset', () => {
	it('Dicke und Farbe/Finish sind entfallen', () => {
		expect(PICKGUARD_FIELDS).not.toContain('pg_thickness');
		expect(PICKGUARD_FIELDS).not.toContain('pg_color_finish');
		expect(FIELD_LABELS['pg_thickness']).toBeUndefined();
		expect(FIELD_LABELS['pg_color_finish']).toBeUndefined();
	});

	it('hat Abschirmung, Fraesungen und Custom Finish als Checkbox mit Detailfeld', () => {
		for (const key of ['pg_custom_finish', 'pg_shielding', 'pg_routing_add', 'pg_routing_remove']) {
			expect(PICKGUARD_FIELDS).toContain(key);
			expect(CHECKBOX_FIELDS.has(key)).toBe(true);
			const detail = DETAIL_FIELD_BY_CHECKBOX[key];
			expect(detail, `${key} hat kein Detailfeld`).toBeTruthy();
			// Detail steht direkt hinter seiner Checkbox
			expect(PICKGUARD_FIELDS.indexOf(detail)).toBe(PICKGUARD_FIELDS.indexOf(key) + 1);
		}
	});

	it('Notizen und Detailfelder sind mehrzeilig', () => {
		expect(isMultilineField('pg_notes')).toBe(true);
		for (const key of Object.keys(CHECKBOX_DETAIL_FIELDS)) {
			if (key === 'pickguard_material') continue; // Materialwahl bleibt einzeilig
			expect(isMultilineField(key), `${key} ist nicht mehrzeilig`).toBe(true);
		}
	});

	it('Kunden-Datenblatt bildet die Felder als Checkbox + Mehrzeiler ab', () => {
		const section = getCustomerSheetSections('PICKGUARD').find((s) => s.title === 'Pickguard');
		expect(section).toBeDefined();
		const byName = new Map(section!.fields.map((f) => [f.name, f]));

		expect(byName.get('order.pg_shielding')?.kind).toBe('checkbox');
		expect(byName.get('order.pg_shielding_details')?.kind).toBe('multiline');
		expect(byName.get('order.pg_shielding_details')?.condition).toEqual({
			controller: 'pg_shielding',
			showWhen: ['Ja', 'ja', 'JA', 'true', '1', 'yes'],
		});
		expect(byName.has('order.pg_thickness')).toBe(false);
		expect(byName.has('order.pg_color_finish')).toBe(false);
	});
});

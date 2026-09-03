import { describe, it, expect } from 'vitest';
import { StockAggregate } from './stock-aggregate.js';

describe('StockAggregate', () => {
  const baseItem = {
    id: 'item-1',
    sku: 'BEARING-6204',
    name: 'Ball Bearing 6204-2RS',
    warehouseId: 'wh-main',
    quantityOnHand: 100,
    minStockThreshold: 20
  };

  it('initializes and records creation outbox event', () => {
    const aggregate = StockAggregate.create({
      ...baseItem,
      initialBatch: {
        batchId: 'b-init',
        batchNumber: 'INIT-01',
        quantity: 100,
        initialQuantity: 100,
        receivedAt: new Date()
      }
    });

    expect(aggregate.availableQuantity).toBe(100);
    expect(aggregate.batches.length).toBe(1);
    expect(aggregate.reservations.length).toBe(0);
    expect(aggregate.movements.length).toBe(0);
    expect(aggregate.outboxEvents.length).toBe(1);
    expect(aggregate.outboxEvents[0].eventType).toBe('wms.stock.created');
    expect(aggregate.outboxEvents[0].payload.sku).toBe('BEARING-6204');
  });

  it('assigns cell and records cell_assigned outbox event', () => {
    const aggregate = StockAggregate.create(baseItem);
    aggregate.assignCell('cell-a1');

    expect(aggregate.props.cellId).toBe('cell-a1');
    const event = aggregate.outboxEvents.find(e => e.eventType === 'wms.stock.cell_assigned');
    expect(event).toBeDefined();
    expect(event?.payload.newCellId).toBe('cell-a1');
  });

  it('receives new batch and increases onHand balance', () => {
    const aggregate = StockAggregate.create(baseItem);

    aggregate.receiveBatch({
      batchNumber: 'BATCH-2026-001',
      quantity: 50,
      unitCost: 15.5,
      supplier: 'SKF Bearings LLC',
      userId: 'user-1'
    });

    expect(aggregate.props.quantityOnHand).toBe(150);
    expect(aggregate.batches.length).toBe(1);
    expect(aggregate.batches[0].batchNumber).toBe('BATCH-2026-001');
    expect(aggregate.movements.length).toBe(1);
    expect(aggregate.movements[0].type).toBe('RECEIPT');

    const event = aggregate.outboxEvents.find(e => e.eventType === 'wms.stock.received');
    expect(event).toBeDefined();
    expect(event?.payload.quantityOnHand).toBe(150);
  });

  it('throws on non-positive received quantity', () => {
    const aggregate = StockAggregate.create(baseItem);
    expect(() => {
      aggregate.receiveBatch({
        batchNumber: 'BATCH-ERR',
        quantity: 0,
        userId: 'user-1'
      });
    }).toThrow('Received quantity must be positive');
  });

  it('reserves and cancels inventory reservation', () => {
    const aggregate = StockAggregate.create({
      ...baseItem,
      quantityOnHand: 30
    });

    aggregate.receiveBatch({
      batchNumber: 'B-1',
      quantity: 30,
      userId: 'u1'
    });

    const res = aggregate.reserve(25, 'WO-9988');
    expect(res.status).toBe('PENDING');
    expect(aggregate.props.quantityReserved).toBe(25);
    expect(aggregate.availableQuantity).toBe(35); // 30 (from create) + 30 (from receiveBatch) - 25

    aggregate.cancelReservation(res.reservationId);
    expect(aggregate.props.quantityReserved).toBe(0);
    expect(res.status).toBe('CANCELLED');

    const cancelEvent = aggregate.outboxEvents.find(e => e.eventType === 'wms.stock.reservation_cancelled');
    expect(cancelEvent).toBeDefined();
    expect(cancelEvent?.payload.releasedQuantity).toBe(25);
  });

  it('throws when cancelling invalid or non-pending reservation', () => {
    const aggregate = StockAggregate.create(baseItem);
    expect(() => aggregate.cancelReservation('unknown-id')).toThrow('Reservation unknown-id not found');

    const res = aggregate.reserve(10, 'WO-1');
    aggregate.cancelReservation(res.reservationId);
    expect(() => aggregate.cancelReservation(res.reservationId)).toThrow('is already CANCELLED');
  });

  it('issues reserved stock and records depletion / threshold alerts', () => {
    const aggregate = StockAggregate.create({
      id: 'item-2',
      sku: 'BELT-100',
      name: 'V-Belt 100',
      warehouseId: 'wh-main',
      quantityOnHand: 25,
      minStockThreshold: 10
    });

    const res = aggregate.reserve(25, 'WO-100');
    expect(aggregate.props.quantityReserved).toBe(25);

    // Issue all reserved stock
    aggregate.issue(25, 'Ivanov I.', {
      reservationId: res.reservationId,
      workOrderId: 'WO-100',
      equipmentId: 'EQ-55',
      userId: 'user-1'
    });

    expect(aggregate.props.quantityOnHand).toBe(0);
    expect(aggregate.props.quantityReserved).toBe(0);
    expect(res.status).toBe('FULFILLED');

    const issueEvent = aggregate.outboxEvents.find(e => e.eventType === 'wms.stock.issued');
    expect(issueEvent).toBeDefined();
    expect(issueEvent?.payload.equipmentId).toBe('EQ-55');

    const depletedEvent = aggregate.outboxEvents.find(e => e.eventType === 'wms.stock.depleted');
    expect(depletedEvent).toBeDefined();
  });

  it('triggers low threshold alert when remaining on hand drops below threshold', () => {
    const aggregate = StockAggregate.create({
      id: 'item-3',
      sku: 'SEAL-20',
      name: 'O-Ring Seal 20mm',
      warehouseId: 'wh-main',
      quantityOnHand: 20,
      minStockThreshold: 15
    });

    aggregate.reserve(8, 'WO-200');
    aggregate.issue(8, 'Petrov P.');

    expect(aggregate.props.quantityOnHand).toBe(12);

    const alert = aggregate.outboxEvents.find(e => e.eventType === 'wms.stock.low_threshold_alert');
    expect(alert).toBeDefined();
    expect(alert?.payload.quantityOnHand).toBe(12);
    expect(alert?.payload.minStockThreshold).toBe(15);
  });

  it('throws when reserving more than available stock', () => {
    const aggregate = StockAggregate.create(baseItem);
    expect(() => aggregate.reserve(150, 'WO-1')).toThrow('Insufficient available stock');
    expect(() => aggregate.reserve(-1, 'WO-1')).toThrow('Reserve amount must be positive');
  });

  it('throws when issuing more than reserved', () => {
    const aggregate = StockAggregate.create(baseItem);
    aggregate.reserve(10, 'WO-1');
    expect(() => aggregate.issue(15, 'Recipient')).toThrow('Cannot issue more than currently reserved stock');
    expect(() => aggregate.issue(0, 'Recipient')).toThrow('Issue amount must be positive');
  });

  it('transfers stock to target warehouse and records transfer event', () => {
    const aggregate = StockAggregate.create(baseItem);
    aggregate.receiveBatch({
      batchNumber: 'BATCH-T',
      quantity: 100,
      userId: 'user-1'
    });

    aggregate.transfer(30, 'wh-remote', 'cell-b2', 'user-1');

    expect(aggregate.props.quantityOnHand).toBe(170); // (100 + 100) - 30
    const event = aggregate.outboxEvents.find(e => e.eventType === 'wms.stock.transferred');
    expect(event).toBeDefined();
    expect(event?.payload.targetWarehouseId).toBe('wh-remote');
    expect(event?.payload.quantity).toBe(30);
  });

  it('throws when transferring invalid quantities', () => {
    const aggregate = StockAggregate.create(baseItem);
    expect(() => aggregate.transfer(0, 'wh-remote')).toThrow('Transfer quantity must be positive');
    expect(() => aggregate.transfer(200, 'wh-remote')).toThrow('Insufficient available stock');
  });

  it('adjusts balance during inventory audit and records delta', () => {
    const aggregate = StockAggregate.create(baseItem);
    aggregate.adjustBalance(92, 'Inventory count variance', 'auditor-1');

    expect(aggregate.props.quantityOnHand).toBe(92);
    const event = aggregate.outboxEvents.find(e => e.eventType === 'wms.stock.adjusted');
    expect(event).toBeDefined();
    expect(event?.payload.previousQuantity).toBe(100);
    expect(event?.payload.newQuantity).toBe(92);
    expect(event?.payload.difference).toBe(-8);
    expect(event?.payload.reason).toBe('Inventory count variance');
  });

  it('throws when adjusting to negative balance', () => {
    const aggregate = StockAggregate.create(baseItem);
    expect(() => aggregate.adjustBalance(-5, 'Err')).toThrow('Adjusted quantity cannot be negative');
  });
});

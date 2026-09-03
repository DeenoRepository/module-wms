import { describe, it, expect } from 'vitest';
import { StockService } from './stock-service.js';

describe('StockService FIFO Allocation', () => {
  const service = new StockService();

  it('allocates strictly according to FIFO based on received date', () => {
    const batches = [
      { batchId: 'batch-2', quantity: 20, receivedAt: new Date('2026-02-01') },
      { batchId: 'batch-1', quantity: 10, receivedAt: new Date('2026-01-01') },
      { batchId: 'batch-3', quantity: 15, receivedAt: new Date('2026-03-01') }
    ];

    const plan = service.allocateFifo(15, batches);

    expect(plan).toEqual([
      { batchId: 'batch-1', quantity: 10 },
      { batchId: 'batch-2', quantity: 5 }
    ]);
  });

  it('throws error when requested quantity exceeds total batch stock', () => {
    const batches = [
      { batchId: 'b1', quantity: 5, receivedAt: new Date('2026-01-01') }
    ];

    expect(() => service.allocateFifo(10, batches)).toThrow('Insufficient stock: missing 5 units');
  });

  it('throws error on non-positive requested quantity', () => {
    expect(() => service.allocateFifo(0, [])).toThrow('Requested quantity must be positive');
    expect(() => service.allocateFifo(-5, [])).toThrow('Requested quantity must be positive');
  });
});

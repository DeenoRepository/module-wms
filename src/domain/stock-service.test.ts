import { describe, it, expect } from 'vitest';
import { StockService } from './stock-service.js';

describe('StockService FIFO Allocation (TDD)', () => {
  const service = new StockService();

  it('allocates batches in strict FIFO order', () => {
    const batches = [
      { batchId: 'B2', quantity: 10, receivedAt: new Date('2026-02-01') },
      { batchId: 'B1', quantity: 5, receivedAt: new Date('2026-01-01') },
      { batchId: 'B3', quantity: 20, receivedAt: new Date('2026-03-01') }
    ];

    const plan = service.allocateFifo(12, batches);
    expect(plan).toEqual([
      { batchId: 'B1', quantity: 5 },
      { batchId: 'B2', quantity: 7 }
    ]);
  });

  it('throws error when requested amount exceeds total available stock', () => {
    const batches = [{ batchId: 'B1', quantity: 5, receivedAt: new Date('2026-01-01') }];
    expect(() => service.allocateFifo(10, batches)).toThrow('Insufficient stock');
  });
});

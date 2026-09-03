export interface Batch {
  batchId: string;
  quantity: number;
  receivedAt: Date;
}

export interface DispatchPlan {
  batchId: string;
  quantity: number;
}

export class StockService {
  allocateFifo(requestedQuantity: number, availableBatches: Batch[]): DispatchPlan[] {
    if (requestedQuantity <= 0) throw new Error('Requested quantity must be positive');

    const sorted = [...availableBatches].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    let remaining = requestedQuantity;
    const plan: DispatchPlan[] = [];

    for (const b of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantity, remaining);
      if (take > 0) {
        plan.push({ batchId: b.batchId, quantity: take });
        remaining -= take;
      }
    }

    if (remaining > 0) {
      throw new Error(`Insufficient stock: missing ${remaining} units`);
    }

    return plan;
  }
}

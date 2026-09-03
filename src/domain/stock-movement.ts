import { z } from 'zod';
import { Batch } from './stock-service.js';

export const OperationTypeSchema = z.enum([
  'RECEIPT',
  'ISSUE',
  'ISSUE_EMPLOYEE',
  'ISSUE_WRITE_OFF',
  'TRANSFER',
  'ADJUSTMENT'
]);

export type OperationType = z.infer<typeof OperationTypeSchema>;

export const StockBatchSchema = z.object({
  batchId: z.string().uuid(),
  stockItemId: z.string().uuid(),
  batchNumber: z.string().min(1).max(50),
  quantity: z.number().nonnegative(),
  initialQuantity: z.number().positive(),
  unitCost: z.number().nonnegative().optional(),
  receivedAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable().optional(),
  supplier: z.string().max(100).nullable().optional()
});

export type StockBatch = z.infer<typeof StockBatchSchema>;

export const StockMovementRecordSchema = z.object({
  id: z.string().uuid(),
  type: OperationTypeSchema,
  stockItemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  sourceCellId: z.string().uuid().nullable().optional(),
  targetCellId: z.string().uuid().nullable().optional(),
  targetWarehouseId: z.string().uuid().nullable().optional(),
  batchId: z.string().uuid().nullable().optional(),
  quantity: z.number().positive(),
  document: z.string().max(100).nullable().optional(),
  counterparty: z.string().max(100).nullable().optional(),
  workOrderId: z.string().uuid().nullable().optional(),
  equipmentId: z.string().uuid().nullable().optional(),
  comment: z.string().max(255).nullable().optional(),
  createdById: z.string().uuid(),
  createdAt: z.coerce.date().default(() => new Date())
});

export type StockMovementRecord = z.infer<typeof StockMovementRecordSchema>;

export interface InventoryReservation {
  reservationId: string;
  stockItemId: string;
  workOrderId: string;
  quantity: number;
  batchAllocations: Array<{ batchId: string; quantity: number }>;
  reservedAt: Date;
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED';
}

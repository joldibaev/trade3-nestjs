import { Injectable } from '@nestjs/common';

import { CodeGeneratorService } from '../code-generator/code-generator.service';
import { BaseDocumentService } from '../common/base-document.service';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { DocumentRevaluation, Prisma } from '../generated/prisma/client';
import { DocumentStatus } from '../generated/prisma/enums';
import { PriceMovementService } from '../price/price-movement.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentRevaluationDto } from './dto/create-document-revaluation.dto';
import { UpdateDocumentRevaluationDto } from './dto/update-document-revaluation.dto';
import Decimal = Prisma.Decimal;

@Injectable()
export class DocumentRevaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: DocumentHistoryService,
    private readonly baseService: BaseDocumentService,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly priceMovement: PriceMovementService,
  ) {}

  async create(createDto: CreateDocumentRevaluationDto): Promise<DocumentRevaluation> {
    const { date, status, notes, items } = createDto;
    const targetStatus = status || 'DRAFT';
    const docDate = new Date(date);

    return this.prisma.$transaction(async (tx) => {
      // 1. Prepare Items & Fetch Old Values
      const preparedItems: {
        productId: string;
        priceTypeId: string;
        oldValue: Decimal;
        newValue: Decimal;
      }[] = [];
      const productIds = items.map((i) => i.productId);
      const currentPrices = await tx.price.findMany({
        where: { productId: { in: productIds } },
      });

      for (const item of items) {
        // Find current price for this type
        const currentPriceObj = currentPrices.find(
          (p) => p.productId === item.productId && p.priceTypeId === item.priceTypeId,
        );
        const oldValue = currentPriceObj ? currentPriceObj.value : new Decimal(0);

        preparedItems.push({
          productId: item.productId,
          priceTypeId: item.priceTypeId,
          oldValue: oldValue,
          newValue: new Decimal(item.newValue),
        });
      }

      // 2. Generate Code & Create Document
      const code = await this.codeGenerator.getNextRevaluationCode();
      const doc = await tx.documentRevaluation.create({
        data: {
          code,
          date: docDate,
          status: targetStatus,
          notes,
          items: {
            create: preparedItems.map((i) => ({
              productId: i.productId,
              priceTypeId: i.priceTypeId,
              oldValue: i.oldValue,
              newValue: i.newValue,
            })),
          },
        },
        include: { items: true },
      });

      // 3. Log History
      await this.ledgerService.logAction(tx, {
        documentId: doc.id,
        documentType: 'documentRevaluation',
        action: 'CREATED',
        details: { status: targetStatus, notes },
      });

      // 4. Execute Changes if COMPLETED
      if (targetStatus === 'COMPLETED') {
        await this.priceMovement.applyPriceChanges(tx, {
          documentId: doc.id,
          date: doc.date,
          items: doc.items,
        });
      }

      return doc;
    });
  }

  async update(id: string, updateDto: UpdateDocumentRevaluationDto): Promise<DocumentRevaluation> {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentRevaluation.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });

      this.baseService.ensureDraft(doc.status);

      const { date, notes, items } = updateDto;
      const docDate = date ? new Date(date) : undefined;

      let itemsUpdateOp: Prisma.DocumentRevaluationUpdateInput['items'] = undefined;

      if (items) {
        // Delete old items
        await tx.documentRevaluationItem.deleteMany({ where: { documentId: id } });

        // Prepare new items
        const preparedItems: {
          productId: string;
          priceTypeId: string;
          oldValue: Decimal;
          newValue: Decimal;
        }[] = [];

        const productIds = items.map((i) => i.productId);
        const currentPrices = await tx.price.findMany({
          where: { productId: { in: productIds } },
        });

        for (const item of items) {
          const currentPriceObj = currentPrices.find(
            (p) => p.productId === item.productId && p.priceTypeId === item.priceTypeId,
          );
          const oldValue = currentPriceObj ? currentPriceObj.value : new Decimal(0);
          preparedItems.push({
            productId: item.productId,
            priceTypeId: item.priceTypeId,
            oldValue: oldValue,
            newValue: new Decimal(item.newValue),
          });
        }

        itemsUpdateOp = {
          create: preparedItems.map((i) => ({
            productId: i.productId,
            priceTypeId: i.priceTypeId,
            oldValue: i.oldValue,
            newValue: i.newValue,
          })),
        };
      }

      return tx.documentRevaluation.update({
        where: { id },
        data: {
          date: docDate,
          notes,
          items: itemsUpdateOp,
        },
        include: { items: true },
      });
    });
  }

  async updateStatus(id: string, newStatus: DocumentStatus): Promise<DocumentRevaluation> {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentRevaluation.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });

      if (doc.status === newStatus) return doc;

      // COMPLETED logic
      if (newStatus === 'COMPLETED') {
        await this.priceMovement.applyPriceChanges(tx, {
          documentId: doc.id,
          date: doc.date,
          items: doc.items,
        });
      }

      // REVERT Logic (Completed -> Draft/Cancelled)
      if (doc.status === 'COMPLETED' && newStatus !== 'COMPLETED') {
        await this.priceMovement.revertPriceChanges(tx, {
          documentId: doc.id,
          date: doc.date,
          items: doc.items,
        });
      }

      return tx.documentRevaluation.update({
        where: { id },
        data: { status: newStatus },
      });
    });
  }

  findAll(): Promise<DocumentRevaluation[]> {
    return this.prisma.documentRevaluation.findMany({
      include: { documentPurchase: true },
      orderBy: { date: 'desc' },
    });
  }

  findOne(id: string): Promise<DocumentRevaluation> {
    return this.prisma.documentRevaluation.findUniqueOrThrow({
      where: { id },
      include: {
        items: { include: { product: true, priceType: true } },
        documentHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}

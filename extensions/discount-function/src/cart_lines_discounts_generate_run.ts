import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from "../generated/api";

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );

  if (!hasProductDiscountClass) {
    console.error("No Product discount class available");
    return { operations: [] };
  }

  const candidates: any[] = [];

  input.cart.lines.forEach((line) => {
    const merchandise = line.merchandise as any;
    const znizka = merchandise?.product?.metafield?.value;

    console.error(
      `Line ${line.id}: znizka=${znizka || "none"}`,
    );

    if (znizka && Number(znizka) > 0) {
      candidates.push({
        message: `${znizka}% OFF`,
        targets: [
          {
            cartLine: {
              id: line.id,
            },
          },
        ],
        value: {
          percentage: {
            value: Number(znizka),
          },
        },
      });
    }
  });

  console.error(`Total discount candidates: ${candidates.length}`);

  if (candidates.length === 0) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

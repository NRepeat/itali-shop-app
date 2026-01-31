import type {
  CartTransformRunInput,
  CartTransformRunResult,
  CartOperation,
  Operation,
} from "../generated/api";

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

export function cartTransformRun(input: CartTransformRunInput): CartTransformRunResult {
  const operations: Operation[] = [];

  console.error("=== Cart Transform START ===");
  console.error("Total lines:", input.cart.lines.length);

  input.cart.lines.forEach((line, index) => {
    console.error(`--- Line ${index} ---`);
    console.error("Line ID:", line.id);

    const merchandise = line.merchandise as any;
    const metafield = merchandise?.product?.metafield;
    const price = line.cost.amountPerQuantity.amount;

    console.error("Metafield znizka:", JSON.stringify(metafield));
    console.error("Price per unit:", price);

    const znizka = metafield?.value;
    if (znizka && Number(znizka) > 0) {
      const discount = Number(znizka) / 100;
      const originalPrice = parseFloat(price);
      const discountedPrice = (originalPrice * (1 - discount)).toFixed(2);

      console.error(`Applying discount: ${znizka}% | ${originalPrice} -> ${discountedPrice}`);

      operations.push({
        lineUpdate: {
          cartLineId: line.id,
          price: {
            adjustment: {
              fixedPricePerUnit: {
                amount: discountedPrice,
              },
            },
          },
        },
      });
    } else {
      console.error("No discount for this line (znizka is empty or 0)");
    }
  });

  console.error("Total operations:", operations.length);
  console.error("=== Cart Transform END ===");

  return operations.length === 0 ? NO_CHANGES : { operations };
}

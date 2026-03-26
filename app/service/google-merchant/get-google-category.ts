import taxonomyMapping from "./all_mappings.json" with { type: "json" };
type TaxonomyMapObject = {
  version: string;
  mappings: {
    input_taxonomy: string;
    output_taxonomy: string;
    rules: {
      input: {
        category: {
          id: string;
          full_name: string;
        };
      };
      output: {
        category: {
          id: string;
          full_name: string;
        }[];
      };
    }[];
  }[];
};
type OutputCategory = { id: string; full_name: string };

class TaxonomyIndexer {
  private index: Map<string, OutputCategory[]> = new Map();

  constructor(data: TaxonomyMapObject) {
    this.buildIndex(data);
  }

  private buildIndex(data: TaxonomyMapObject) {
    for (const mapping of data.mappings) {
      for (const rule of mapping.rules) {
        const inputId = rule.input.category.id;
        const currentOutputs = this.index.get(inputId) || [];

        this.index.set(inputId, [...currentOutputs, ...rule.output.category]);
      }
    }
  }

  find(inputId: string): OutputCategory[] {
    return this.index.get(inputId) || [];
  }
}
const typedTaxonomyMapping = taxonomyMapping as TaxonomyMapObject;
const taxonomySearch = new TaxonomyIndexer(typedTaxonomyMapping);

export const getGoogleProductCategory = (shopifyId: string) => {
  return taxonomySearch.find(shopifyId);
};

const findId = "gid://shopify/TaxonomyCategory/aa-5-4";
console.log(getGoogleProductCategory(findId));

export interface Field {
  name: string;
  type: string;
  isOptional: boolean;
  isArray: boolean;
  isEnum: boolean;
  isRelation: boolean;
  isSystem: boolean; // id, createdAt, updatedAt
  hasDefault: boolean;
}

export interface Model {
  name: string;
  singular: string;
  plural: string;
  fields: Field[];
}

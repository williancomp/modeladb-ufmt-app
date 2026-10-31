import { isMany } from '../domain/semantics.js';

// GraphQL names allow letters, digits and underscores: transliterate accents instead of dropping letters.
const gqlName = (name) => String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, '_$1');

export function exportGraphql(ir) {
  let code = '';

  const getGqlType = (attr) => {
    const mapping = {
      // Conceptual types (user-facing)
      'Texto': 'String',
      'Numérico Inteiro': 'Int',
      'Numérico Real': 'Float',
      'Data': 'String',
      'Data e Hora': 'String',
      'Booleano': 'Boolean',
      'Identificador': 'ID',
      // Legacy internal keys
      'string': 'String',
      'integer': 'Int',
      'decimal': 'Float',
      'date': 'String',
      'datetime': 'String',
      'boolean': 'Boolean',
      'uuid': 'ID'
    };
    return mapping[attr.dataType] || 'String';
  };

  const processAttributes = (attributes, indent = '  ') => {
    let result = '';
    attributes.forEach(attr => {
      if (attr.type === 'composite' && attr.subAttributes) {
        // GraphQL has no inline object types: the parts are flattened as <composite>_<part>.
        result += processAttributes(attr.subAttributes.map(sub => ({ ...sub, name: `${attr.name}_${sub.name}` })), indent);
      } else {
        const type = getGqlType(attr);
        const arrayWrapper = attr.type === 'multivalued' ? `[${type}]` : type;
        const required = attr.primaryKey ? '!' : '';
        result += `${indent}${gqlName(attr.name)}: ${arrayWrapper}${required}\n`;
      }
    });
    return result;
  };

  // Generate a type for each entity
  (ir.entities || []).forEach(ent => {
    const typeName = gqlName(ent.name).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    code += `type ${typeName} {\n`;

    // Default ID if no PK
    const hasPk = (ent.attributes || []).some(a => a.primaryKey);
    if (!hasPk) {
      code += `  id: ID!\n`;
    }

    const attributeLines = processAttributes(ent.attributes || []);
    code += attributeLines;
    const used = new Set([...(hasPk ? [] : ['id']), ...[...attributeLines.matchAll(/^\s+(\w+):/gm)].map(m => m[1])]);

    // Relationships
    (ir.relationships || []).forEach(rel => {
      const parts = rel.participants || [];
      const myPart = parts.find(p => p.entityId === ent.id);
      if (myPart) {
        const otherParts = parts.filter(p => p !== myPart);
        otherParts.forEach(other => {
          const targetEnt = ir.entities.find(e => e.id === other.entityId);
          if (targetEnt) {
            let fieldName = gqlName((other.role ? other.role + '_' : '') + targetEnt.name.toLowerCase());
            // Several relationships between the same types, or a clash with an attribute, need distinct field names.
            if (used.has(fieldName)) fieldName = `${fieldName}_${gqlName(rel.name).toLowerCase()}`;
            for (let n = 2; used.has(fieldName); n++) fieldName = `${fieldName.replace(/_\d+$/, '')}_${n}`;
            used.add(fieldName);
            const targetTypeName = gqlName(targetEnt.name).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
            const many = isMany(other.cardinality.max);
            code += `  ${fieldName}: ${many ? `[${targetTypeName}]` : targetTypeName}\n`;
          }
        });
      }
    });

    code += `}\n\n`;
  });

  return code;
}

export function exportJsonSchema(ir) {
  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {}
  };

  const getJsonType = (attr) => {
    if (attr.dataType === 'integer' || attr.dataType === 'Numérico Inteiro') return 'integer';
    if (attr.dataType === 'decimal' || attr.dataType === 'Numérico Real') return 'number';
    if (attr.dataType === 'boolean' || attr.dataType === 'Booleano') return 'boolean';
    return 'string';
  };

  const buildProperties = (attributes) => {
    const props = {};
    attributes.forEach(attr => {
      const propName = attr.name;
      if (attr.type === 'composite' && attr.subAttributes) {
        const subProps = buildProperties(attr.subAttributes);
        props[propName] = { type: 'object', properties: subProps };
      } else {
        const baseType = getJsonType(attr);
        if (attr.type === 'multivalued') {
          props[propName] = { type: 'array', items: { type: baseType } };
        } else {
          props[propName] = { type: baseType };
        }
      }
    });
    return props;
  };

  (ir.entities || []).forEach(ent => {
    schema.properties[ent.id] = {
      type: "object",
      title: ent.name,
      properties: buildProperties(ent.attributes || [])
    };
  });

  return JSON.stringify(schema, null, 2);
}

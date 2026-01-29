const fs = require('fs');
const path = require('path');

console.log('🔧 Airlink Panel TypeScript Fix Script (Updated)');
console.log('=================================================\n');

// Ensure type helpers exist
const typeHelpersPath = path.join('src', 'utils', 'typeHelpers.ts');
if (!fs.existsSync(typeHelpersPath)) {
  console.log('📝 Creating type helper utilities...');
  const typeHelpersContent = `/**
 * Type helper utilities for handling Express params
 */

/**
 * Converts Express param (which can be string or string[]) to a single string
 */
export function getParamAsString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0] || '';
  }
  return param || '';
}

/**
 * Safely converts Express param to number
 */
export function getParamAsNumber(param: string | string[] | undefined): number {
  return parseInt(getParamAsString(param), 10);
}
`;
  
  const utilsDir = path.join('src', 'utils');
  if (!fs.existsSync(utilsDir)) {
    fs.mkdirSync(utilsDir, { recursive: true });
  }
  fs.writeFileSync(typeHelpersPath, typeHelpersContent);
  console.log('✅ Type helpers created\n');
} else {
  console.log('ℹ️  Type helpers already exist\n');
}

// Define all file patches including the new ones
const patches = [
  // API Alternative
  {
    file: 'src/modules/api/Alternative/api.ts',
    replacements: [
      {
        from: /where:\s*{\s*id:\s*parseInt\(userId\)\s*}/g,
        to: 'where: { id: getParamAsNumber(userId) }'
      },
      {
        from: /const\s+userId\s*=\s*parseInt\(req\.params\.id\);/g,
        to: 'const userId = getParamAsNumber(req.params.id);'
      },
      {
        from: /const\s+nodeId\s*=\s*parseInt\(req\.params\.id\);/g,
        to: 'const nodeId = getParamAsNumber(req.params.id);'
      }
    ],
    importPath: '../../../utils/typeHelpers'
  },
  // API v1
  {
    file: 'src/modules/api/v1/api.ts',
    replacements: [
      {
        from: /const\s+userId\s*=\s*parseInt\(req\.params\.id\);/g,
        to: 'const userId = getParamAsNumber(req.params.id);'
      },
      {
        from: /where:\s*{\s*UUID:\s*serverId\s*}/g,
        to: 'where: { UUID: getParamAsString(serverId) }'
      },
      {
        from: /const\s+nodeId\s*=\s*parseInt\(req\.params\.id\);/g,
        to: 'const nodeId = getParamAsNumber(req.params.id);'
      }
    ],
    importPath: '../../../utils/typeHelpers'
  },
  // User server.ts - additional fixes
  {
    file: 'src/modules/user/server.ts',
    replacements: [
      {
        from: /const\s+extension\s*=\s*filePath\.split/g,
        to: 'const extension = getParamAsString(filePath).split'
      },
      {
        from: /name:\s*filePath\.split/g,
        to: 'name: getParamAsString(filePath).split'
      },
      {
        from: /extension:\s*filePath\.split/g,
        to: 'extension: getParamAsString(filePath).split'
      },
      {
        from: /if\s*\(filePath\.endsWith/g,
        to: 'if (getParamAsString(filePath).endsWith'
      },
      {
        from: /await\s+isWorld\(filePath,/g,
        to: 'await isWorld(getParamAsString(filePath),'
      }
    ],
    importPath: '../../../utils/typeHelpers',
    ensureImport: true
  },
  // User serverConsole.ts
  {
    file: 'src/modules/user/serverConsole.ts',
    replacements: [
      {
        from: /where:\s*{\s*UUID:\s*serverId\s*}/g,
        to: 'where: { UUID: getParamAsString(serverId) }'
      }
    ],
    importPath: '../../../utils/typeHelpers'
  }
];

console.log('🔨 Applying patches to source files...\n');
let patchedCount = 0;
let errorCount = 0;

patches.forEach(patch => {
  if (!fs.existsSync(patch.file)) {
    console.log(`⚠️  Skipping ${patch.file} (file not found)`);
    return;
  }

  try {
    let content = fs.readFileSync(patch.file, 'utf8');
    let modified = false;

    // Add import if not already present
    const importStatement = `import { getParamAsString, getParamAsNumber } from "${patch.importPath}";`;
    if (!content.includes('import { getParamAsString')) {
      // Find the last import statement
      const lines = content.split('\n');
      let lastImportIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ')) {
          lastImportIndex = i;
        }
      }
      
      if (lastImportIndex >= 0) {
        lines.splice(lastImportIndex + 1, 0, importStatement);
        content = lines.join('\n');
        modified = true;
      } else {
        // No imports found, add at the top
        lines.unshift(importStatement);
        content = lines.join('\n');
        modified = true;
      }
    }

    // Apply replacements
    patch.replacements.forEach(replacement => {
      const beforeLength = content.length;
      content = content.replace(replacement.from, replacement.to);
      if (content.length !== beforeLength) {
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(patch.file, content);
      console.log(`✅ Patched: ${patch.file}`);
      patchedCount++;
    } else {
      console.log(`ℹ️  No changes needed: ${patch.file}`);
    }
  } catch (error) {
    console.log(`❌ Error patching ${patch.file}: ${error.message}`);
    errorCount++;
  }
});

console.log(`\n📊 Summary:`);
console.log(`   - Patched: ${patchedCount} file(s)`);
console.log(`   - Errors: ${errorCount} file(s)`);

// Additional fix for serverConsole.ts - need to add node relation in query
console.log('\n🔧 Applying special fix for serverConsole.ts node relation...\n');

const serverConsolePath = 'src/modules/user/serverConsole.ts';
if (fs.existsSync(serverConsolePath)) {
  try {
    let content = fs.readFileSync(serverConsolePath, 'utf8');
    
    // Find all prisma.server.findUnique queries and add node include
    // Look for patterns like: prisma.server.findUnique({ where: { UUID: ... } })
    // and ensure they have include: { node: true }
    
    const findUniquePattern = /(prisma\.server\.findUnique\(\{\s*where:\s*\{[^}]+\})\s*\}/g;
    const matches = content.match(findUniquePattern);
    
    if (matches) {
      matches.forEach(match => {
        if (!match.includes('include') && !match.includes('select')) {
          const replacement = match.slice(0, -1) + ', include: { node: true } }';
          content = content.replace(match, replacement);
        }
      });
      
      fs.writeFileSync(serverConsolePath, content);
      console.log(`✅ Added node relation includes to: ${serverConsolePath}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not add node relations: ${error.message}`);
    console.log('   You may need to manually add "include: { node: true }" to prisma queries');
  }
}

// Same fix for user/server.ts if it has node relation issues
const userServerPath = 'src/modules/user/server.ts';
if (fs.existsSync(userServerPath)) {
  try {
    let content = fs.readFileSync(userServerPath, 'utf8');
    let modified = false;
    
    // Find queries that access .node but don't include it
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // Look for findUnique or findFirst without include but followed by .node access
      if (lines[i].includes('prisma.server.find') && 
          !lines[i].includes('include') &&
          !lines[i].includes('select')) {
        // Check if node is accessed in nearby lines
        const checkRange = Math.min(i + 20, lines.length);
        let needsNode = false;
        for (let j = i; j < checkRange; j++) {
          if (lines[j].includes('.node.') || lines[j].includes('.node?')) {
            needsNode = true;
            break;
          }
        }
        
        if (needsNode && lines[i].includes('where:')) {
          // Add include before the closing of the query object
          if (lines[i].includes('})')) {
            lines[i] = lines[i].replace('})' , ', include: { node: true, image: true } })');
            modified = true;
          }
        }
      }
    }
    
    if (modified) {
      fs.writeFileSync(userServerPath, lines.join('\n'));
      console.log(`✅ Added node/image relation includes to: ${userServerPath}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not add relations to server.ts: ${error.message}`);
  }
}

console.log('\n🎉 All fixes applied!');
console.log('\n📦 Now run: npm run build');
console.log('\nIf you still see "Property \'node\' does not exist" errors:');
console.log('   Add "include: { node: true }" to the relevant prisma.server.findUnique() calls\n');

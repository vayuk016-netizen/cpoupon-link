# Coupon Link Manager — Source Code

ឯកសារនេះជាសេចក្ដីណែនាំជាភាសាខ្មែរ សម្រាប់ដំឡើង និងដំណើរការ Coupon Link Manager នៅលើកុំព្យូទ័រ។

## 1. តម្រូវការជាមុន

- កុំព្យូទ័រ Windows, macOS ឬ Linux
- Node.js ជំនាន់ LTS (ណែនាំ 20 ឬថ្មីជាងនេះ)
- Bun package manager (ណែនាំជំនាន់ដែលស្របជាមួយ `app/bun.lock`)
- Visual Studio Code ឬ code editor ផ្សេងទៀត (ជាជម្រើស)

## 2. ពន្លា ZIP

1. ពន្លា `Coupon-Link-Manager-Source-Code.zip` ទៅក្នុងថតដែលអ្នកចង់បាន។
2. បើកថត Project ក្នុង Visual Studio Code។
3. បើក Terminal នៅក្នុងថត Project ដែលមានថត `app`។

## 3. ដំឡើង Dependencies

ចូលទៅថត `app` រួចដំឡើង packages៖

```bash
cd app
bun install
```

បើមិនទាន់មាន Bun អ្នកអាចដំឡើងតាមការណែនាំផ្លូវការនៅ https://bun.sh/docs/installation ។

## 4. ដំណើរការលើម៉ាស៊ីនខ្លួនឯង

នៅក្នុងថត `app` រត់៖

```bash
bun run dev
```

បន្ទាប់មកបើក URL ដែល Terminal បង្ហាញ (ជាទូទៅ `http://localhost:3000`) នៅក្នុង Browser។ ប្រសិនបើ Port ខុស សូមប្រើ URL ដែល Vite បង្ហាញពិតប្រាកដ។

## 5. Build និងពិនិត្យ TypeScript

```bash
bun run typecheck
bun run build
```

Build អាចត្រូវការការកំណត់បន្ថែម ឬសេវាកម្មដែលពាក់ព័ន្ធនឹង environment ដើមរបស់ Higgsfield។ បើមាន error សូមអានសារ error ក្នុង Terminal។

## 6. មុខងារសំខាន់ៗ

- បន្ថែម កែប្រែ និងលុប Coupon Link
- រក្សាទុកចំណងជើង, link, ប្រភព, ថ្ងៃទទួល, ថ្ងៃផុតកំណត់ និងកំណត់ចំណាំ
- ស្វែងរក និងច្រោះតាមស្ថានភាព
- ចម្លង Link និងបើក Link
- សម្គាល់ថាបាន Activate រួច
- Export/Import JSON សម្រាប់ Backup និង Restore

## 7. សំខាន់អំពីការរក្សាទុកទិន្នន័យ

- ទិន្នន័យ Coupon ត្រូវបានរក្សាទុកក្នុង IndexedDB របស់ Browser លើឧបករណ៍នោះ។
- ទិន្នន័យមិនត្រូវបាន Sync ដោយស្វ័យប្រវត្តិទៅឧបករណ៍ផ្សេងទេ។ សូម Export JSON ដើម្បី Backup ហើយ Import នៅពេលចង់ស្ដារទិន្នន័យ។
- ការលុប Browser data ឬប្រើ Browser profile ផ្សេងអាចធ្វើឱ្យទិន្នន័យមិនអាចចូលប្រើបាន។
- ស្ថានភាព Expired/Expiring soon គឺគណនាតាមថ្ងៃផុតកំណត់ដែលអ្នកបញ្ចូលប៉ុណ្ណោះ។ វាមិនអាចពិនិត្យសុពលភាព Coupon ពី Google ឬបន្ថែមរយៈពេលសុពលភាព Link បានទេ។
- ការដាក់ Website ឱ្យ Online មិនមានន័យថាទិន្នន័យនៅក្នុង Browser នឹងត្រូវបានចែករំលែកជាមួយអ្នកប្រើផ្សេងទេ។

## 8. ឯកសារសំខាន់ៗ

- `app/src/routes/index.tsx` — ទំព័រ និងមុខងាររបស់ Coupon Link Manager
- `app/src/routes/__root.tsx` — Root route និង metadata
- `app/src/styles.css` — រចនាប័ទ្ម UI
- `app/src/app-meta.json` — Metadata របស់ Website
- `app/package.json` — Scripts និង dependencies
- `app/bun.lock` — Lockfile សម្រាប់ packages
- `app/packages/` — Workspace packages ដែល Project ប្រើ

## 9. ចំណាំអំពី Source Code

កញ្ចប់នេះត្រូវបានបង្កើតពី Git commit ចុងក្រោយដែលមាននៅក្នុង repository របស់ Project។ វាមិនរួមបញ្ចូល `.git` history ឬ `node_modules` ទេ។ ត្រូវរត់ `bun install` មុនដំណើរការ។

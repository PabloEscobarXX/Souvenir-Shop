const DEFAULT_PRODUCTS = [
  { id: crypto.randomUUID(), name: "Manila Ref Magnet", category: "Magnets", barcode: "1111", price: 120, stock: 25, image: "assets/magnet.svg" },
  { id: crypto.randomUUID(), name: "Philippines Keychain", category: "Keychains", barcode: "2222", price: 80, stock: 30, image: "assets/keychain.svg" },
  { id: crypto.randomUUID(), name: "Jeepney Miniature", category: "Decor", barcode: "3333", price: 350, stock: 12, image: "assets/jeepney.svg" },
  { id: crypto.randomUUID(), name: "I ❤️ Manila Shirt", category: "Shirts", barcode: "4444", price: 450, stock: 18, image: "assets/shirt.svg" },
  { id: crypto.randomUUID(), name: "Woven Coin Purse", category: "Bags", barcode: "5555", price: 150, stock: 20, image: "assets/purse.svg" },
  { id: crypto.randomUUID(), name: "Wooden Carabao", category: "Decor", barcode: "3334", price: 280, stock: 8, image: "assets/carabao.svg" },
  { id: crypto.randomUUID(), name: "Philippines Tote Bag", category: "Bags", barcode: "5556", price: 250, stock: 15, image: "assets/tote.svg" },
  { id: crypto.randomUUID(), name: "Postcard Set", category: "Stationery", barcode: "6666", price: 100, stock: 35, image: "assets/postcard.svg" }
];

const fallbackImages = ["assets/magnet.svg","assets/keychain.svg","assets/jeepney.svg","assets/shirt.svg","assets/purse.svg","assets/carabao.svg","assets/tote.svg","assets/postcard.svg"];
const DEFAULT_CATEGORY_PREFIXES={Magnets:"1111",Keychains:"2222",Decor:"3333",Shirts:"4444",Bags:"5555",Stationery:"6666"};
const ROYALTY_RATE=5;

const SHOPS_STORAGE_KEY = "likha_pos_shops";
const legacyProducts = JSON.parse(localStorage.getItem("likha_pos_products") || "null") || DEFAULT_PRODUCTS;
const legacySales = JSON.parse(localStorage.getItem("likha_pos_sales") || "null") || [];
const savedShops = JSON.parse(localStorage.getItem(SHOPS_STORAGE_KEY) || "null");
const shops = Array.isArray(savedShops) && savedShops.length
  ? savedShops.map(shop=>({...shop,products:Array.isArray(shop.products)?shop.products:[],sales:Array.isArray(shop.sales)?shop.sales:[]}))
  : [{id:"pup-souvenir-shop",name:"PUP Souvenir Shop",products:legacyProducts,sales:legacySales}];
const storedShopId = localStorage.getItem("likha_pos_selected_shop");
const state = {
  shops,
  selectedShopId:shops.some(shop=>shop.id===storedShopId)?storedShopId:shops[0].id,
  reportShopId:"__all_shops__",
  cart: [],
  category: "All",
  search: "",
  role: null,
  get currentShop(){return this.shops.find(shop=>shop.id===this.selectedShopId)||this.shops[0]},
  get products(){return this.currentShop.products},
  set products(products){this.currentShop.products=products},
  get sales(){return this.currentShop.sales},
  set sales(sales){this.currentShop.sales=sales}
};

function getSoldBarcodes(barcode,quantity,previouslySold=0){
  const code=String(barcode||"").trim();
  const units=Math.max(0,Math.floor(Number(quantity)||0));
  const start=Math.max(0,Math.floor(Number(previouslySold)||0));
  return code&&units>0?Array.from({length:units},(_,index)=>`${code}${start+index+1}`):[];
}
function getItemSoldBarcodes(item,barcode=item.barcode,previouslySold=0){
  if(Array.isArray(item.soldBarcodes)&&item.soldBarcodes.length)return item.soldBarcodes;
  return getSoldBarcodes(barcode,item.qty,previouslySold);
}
function normalizedCategory(category){return String(category||"Uncategorized").trim().toLocaleLowerCase()}
function getCategoryBarcodePrefix(category){
  const categoryKey=normalizedCategory(category);
  const products=state.shops.flatMap(shop=>shop.products);
  const existing=products.find(product=>normalizedCategory(product.category)===categoryKey&&product.categoryBarcodePrefix)?.categoryBarcodePrefix;
  if(existing)return String(existing);
  const historical=state.shops.flatMap(shop=>shop.sales).flatMap(sale=>sale.items)
    .find(item=>normalizedCategory(item.category)===categoryKey&&item.categoryBarcodePrefix)?.categoryBarcodePrefix;
  if(historical)return String(historical);
  const known=Object.entries(DEFAULT_CATEGORY_PREFIXES).find(([name])=>normalizedCategory(name)===categoryKey)?.[1];
  if(known)return known;
  const usedPrefixes=new Set([
    ...Object.values(DEFAULT_CATEGORY_PREFIXES),
    ...products.map(product=>String(product.categoryBarcodePrefix||"")),
    ...state.shops.flatMap(shop=>shop.sales).flatMap(sale=>sale.items.map(item=>String(item.categoryBarcodePrefix||"")))
  ]);
  for(let digit=1;digit<=9;digit++){
    const prefix=String(digit).repeat(4);
    if(!usedPrefixes.has(prefix))return prefix;
  }
  let prefix=10000;
  while([...usedPrefixes].some(used=>Number(used)<prefix+1000&&Number(used)+1000>prefix))prefix+=1000;
  return String(prefix);
}
function getNextCategoryBarcode(category,ignoreProductId=""){
  const prefix=getCategoryBarcodePrefix(category);
  const existing=new Set(state.shops.flatMap(shop=>shop.products)
    .filter(product=>product.id!==ignoreProductId)
    .map(product=>String(product.barcode||"").trim()));
  const categoryProducts=state.shops.flatMap(shop=>shop.products)
    .filter(product=>normalizedCategory(product.category)===normalizedCategory(category)&&product.id!==ignoreProductId);
  const lastCategoryCode=categoryProducts.reduce((last,product)=>{
    const code=Number(product.barcode);
    return Number.isInteger(code)&&code>=Number(prefix)&&code<Number(prefix)+1000?Math.max(last,code):last;
  },Number(prefix)-1);
  let next=Math.max(Number(prefix),lastCategoryCode+1);
  while(existing.has(String(next)))next++;
  return String(next);
}
function getSoldUnitCount(categoryPrefix,sales=state.shops.flatMap(shop=>shop.sales)){
  const prefix=String(categoryPrefix||"");
  return sales.reduce((count,sale)=>count+sale.items.reduce((itemCount,item)=>
    itemCount+(String(item.categoryBarcodePrefix||"")===prefix?(Number(item.qty)||0):0),0),0);
}
const seenBarcodes=new Set();
shops.forEach(shop=>{
  shop.products.forEach(product=>{
    const barcode=String(product.barcode||"").trim();
    if(!barcode||seenBarcodes.has(barcode))product.barcode=getNextCategoryBarcode(product.category,product.id);
    seenBarcodes.add(product.barcode);
    const stock=Number(product.stock);
    product.stock=Number.isInteger(stock)&&stock>=0?stock:0;
    const actualStock=Number(product.actualStock);
    product.actualStock=Number.isInteger(actualStock)&&actualStock>=0?actualStock:product.stock;
  });
});

const LOGIN_CREDENTIALS = {
  souvenir: { username: "shopowner", password: "owner123" },
  rgo: { username: "admin", password: "admin123" }
};
const ACCOUNTS_STORAGE_KEY = "likha_pos_accounts";
const DEFAULT_ACCOUNTS = [
  { role: "souvenir", username: LOGIN_CREDENTIALS.souvenir.username, password: LOGIN_CREDENTIALS.souvenir.password },
  { role: "rgo", username: LOGIN_CREDENTIALS.rgo.username, password: LOGIN_CREDENTIALS.rgo.password }
];
const savedAccounts = JSON.parse(localStorage.getItem(ACCOUNTS_STORAGE_KEY) || "null");
const accounts = Array.isArray(savedAccounts) ? savedAccounts : DEFAULT_ACCOUNTS;
const DOCUMENTS_STORAGE_KEY = "sintalaan_documents";
let documents = [];
const PAYMENT_REMINDERS_STORAGE_KEY="sintalaan_payment_reminders";
let paymentReminders=[];
const DAILY_REPORT_DETAILS_KEY="sintalaan_daily_report_details";
let dailyReportDetails={};
let dailyReportStorageError=false;
const SETTINGS_STORAGE_KEY = "sintalaan_settings";
let lowStockThreshold = 5;
try {
  const savedDocuments = JSON.parse(localStorage.getItem(DOCUMENTS_STORAGE_KEY) || "[]");
  documents = Array.isArray(savedDocuments) ? savedDocuments : [];
} catch (storageError) {
  console.error("Could not read saved documents.", storageError);
}
try {
  const savedReminders=JSON.parse(localStorage.getItem(PAYMENT_REMINDERS_STORAGE_KEY)||"[]");
  paymentReminders=Array.isArray(savedReminders)?savedReminders:[];
} catch (storageError) {
  console.error("Could not read payment reminders.",storageError);
}
try {
  const savedReportDetails=JSON.parse(localStorage.getItem(DAILY_REPORT_DETAILS_KEY)||"{}");
  dailyReportDetails=savedReportDetails&&typeof savedReportDetails==="object"&&!Array.isArray(savedReportDetails)?savedReportDetails:{};
} catch (storageError) {
  console.error("Could not read daily report details.",storageError);
}
try {
  const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
  if(Number.isInteger(savedSettings.lowStockThreshold)&&savedSettings.lowStockThreshold>=1&&savedSettings.lowStockThreshold<=1000)lowStockThreshold=savedSettings.lowStockThreshold;
} catch (storageError) {
  console.error("Could not read system settings.", storageError);
}
let authMode = "login";
let selectedAuthRole = "souvenir";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const $ = id => document.getElementById(id);

const els = {
  productGrid: $("productGrid"), categoryFilters: $("categoryFilters"), searchInput: $("searchInput"),
  cartItems: $("cartItems"), subtotal: $("subtotal"), total: $("total"), discountInput: $("discountInput"),
  discountType: $("discountType"), paymentMethod: $("paymentMethod"), cashInput: $("cashInput"),
  change: $("change"), inventoryTable: $("inventoryTable"), salesTable: $("salesTable"),
  salesCount: $("salesCount"), salesRevenue: $("salesRevenue"), receiptContent: $("receiptContent"),
  clock: $("clock"), cartCounter: $("cartCounter"), productCountText: $("productCountText"),
  cashBlock: $("cashBlock"), toast: $("toast")
};

function escapeHtml(text){return String(text).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function saveData(){
  localStorage.setItem(SHOPS_STORAGE_KEY,JSON.stringify(state.shops));
  localStorage.setItem("likha_pos_selected_shop",state.selectedShopId);
  if(state.currentShop.id==="pup-souvenir-shop"){
    localStorage.setItem("likha_pos_products",JSON.stringify(state.products));
    localStorage.setItem("likha_pos_sales",JSON.stringify(state.sales));
  }
}
const DEFAULT_BARCODE_MIGRATION_KEY="sintalaan_default_barcode_migration_v3";
const needsDefaultBarcodeMigration=localStorage.getItem(DEFAULT_BARCODE_MIGRATION_KEY)!=="1";
if(needsDefaultBarcodeMigration){
  const allProducts=shops.flatMap(shop=>shop.products);
  const productsByCategory=new Map();
  allProducts.forEach(product=>{
    const key=normalizedCategory(product.category);
    if(!productsByCategory.has(key))productsByCategory.set(key,[]);
    productsByCategory.get(key).push(product);
  });
  const assignedPrefixes=new Set();
  productsByCategory.forEach((products,key)=>{
    const category=products[0]?.category;
    const configuredPrefix=Object.entries(DEFAULT_CATEGORY_PREFIXES)
      .find(([name])=>normalizedCategory(name)===key)?.[1];
    const existingPrefix=products.find(product=>/^\d{4}$/.test(String(product.categoryBarcodePrefix||"")))?.categoryBarcodePrefix;
    const firstDefault=products.find(product=>DEFAULT_PRODUCTS.some(entry=>entry.name===product.name&&entry.category===product.category));
    const oldRepeatedPrefix=String(firstDefault?.barcode||products[0]?.barcode||"").match(/^(\d)\1{3}$/)?.[0];
    let prefix=configuredPrefix||existingPrefix||oldRepeatedPrefix;
    if(!prefix||assignedPrefixes.has(String(prefix))){
      for(let digit=1;digit<=9;digit++){
        const candidate=String(digit).repeat(4);
        if(!assignedPrefixes.has(candidate)){prefix=candidate;break}
      }
    }
    if(!prefix||assignedPrefixes.has(String(prefix))){
      let candidate=10000;
      while([...assignedPrefixes].some(used=>Number(used)<candidate+1000&&Number(used)+1000>candidate))candidate+=1000;
      prefix=String(candidate);
    }
    prefix=String(prefix);
    assignedPrefixes.add(prefix);
    products.forEach((product,index)=>{
      product.categoryBarcodePrefix=prefix;
      product.barcode=String(Number(prefix)+index);
    });
    if(!category)console.warn("A product category is blank; assigned a fallback barcode series.");
  });
  const productsById=new Map(allProducts.map(product=>[product.id,product]));
  const orderedSales=shops.flatMap(shop=>shop.sales.map((sale,index)=>({shop,sale,index})))
    .sort((a,b)=>new Date(a.sale.date)-new Date(b.sale.date)||a.index-b.index);
  const soldCounts=new Map();
  orderedSales.forEach(({shop,sale})=>{
    (Array.isArray(sale.items)?sale.items:[]).forEach(item=>{
      const product=productsById.get(item.productId)||shop.products.find(entry=>entry.name===item.name);
      const category=product?.category||item.category||"Uncategorized";
      const prefix=product?.categoryBarcodePrefix||getCategoryBarcodePrefix(category);
      const key=normalizedCategory(category);
      const count=soldCounts.get(key)||0;
      item.category=category;
      item.categoryBarcodePrefix=prefix;
      item.barcode=product?.barcode||item.barcode;
      item.soldBarcodes=getSoldBarcodes(prefix,item.qty,count);
      item.soldBarcode=item.soldBarcodes[0]||prefix;
      soldCounts.set(key,count+(Number(item.qty)||0));
    });
  });
}
function getCategories(){return ["All",...new Set(state.products.map(p=>p.category))]}

function showToast(message){
  els.toast.textContent=message; els.toast.classList.remove("hidden");
  clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>els.toast.classList.add("hidden"),1200);
}

function renderCategories(){
  els.categoryFilters.innerHTML=getCategories().map(cat=>`<button class="filter-btn ${state.category===cat?"active":""}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join("");
  document.querySelectorAll("[data-category]").forEach(btn=>btn.onclick=()=>{state.category=btn.dataset.category;renderCategories();renderProducts()});
}

function renderProducts(){
  const q=state.search.toLowerCase();
  const filtered=state.products.filter(p=>(state.category==="All"||p.category===state.category)&&(p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)||String(p.barcode||"").toLowerCase().includes(q)));
  els.productCountText.textContent=`${filtered.length} product${filtered.length===1?"":"s"} available`;
  if(!filtered.length){els.productGrid.innerHTML=`<div class="empty-state"><div class="empty-icon">🔎</div><strong>No products found</strong><span>Try another search or category.</span></div>`;return}
  els.productGrid.innerHTML=filtered.map((p,i)=>{
    const cls=p.stock===0?"out":p.stock<=lowStockThreshold?"low":"";
    const img=p.image||fallbackImages[i%fallbackImages.length];
    return `<article class="product-card">
      <div class="product-image-wrap"><img class="product-image" src="${img}" alt="${escapeHtml(p.name)}"><span class="stock-badge ${cls}">${p.stock===0?"Sold out":`${p.stock} left`}</span></div>
      <div class="product-info"><span class="category-pill">${escapeHtml(p.category)}</span><h3>${escapeHtml(p.name)}</h3>
      <div class="product-bottom"><span class="price">${peso.format(p.price)}</span><button class="add-btn" data-add="${p.id}" ${p.stock===0?"disabled":""}>+</button></div></div>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-add]").forEach(btn=>btn.onclick=()=>addToCart(btn.dataset.add));
}

function renderRegisteredProducts(){
  const table=$("registeredProductsTable");
  if(!table)return;
  const query=$("registeredProductSearch").value.trim().toLowerCase();
  const products=state.products.filter(product=>
    `${product.name} ${product.category} ${product.barcode||""}`.toLowerCase().includes(query)
  );
  $("registeredProductsCount").textContent=state.products.length.toLocaleString("en-PH");
  table.innerHTML=products.length?products.map(product=>{
    const stock=Number(product.stock)||0;
    const actualStock=Number(product.actualStock)||0;
    const unaccounted=actualStock!==stock;
    const status=unaccounted?"Unaccounted":stock===0?"Sold":"In stock";
    return `<tr><td><code class="barcode-cell">${escapeHtml(product.barcode||"")}</code></td><td class="registered-product-name">${escapeHtml(product.name)}</td><td>${escapeHtml(product.category)}</td><td>${peso.format(Number(product.price)||0)}</td><td>${stock}</td><td>${actualStock}</td><td><span class="inventory-status ${unaccounted?"unaccounted":stock===0?"out":"in"}">${unaccounted?"⚠ RGO · ":""}${status}</span></td><td><div class="registered-product-actions"><button type="button" class="small-btn" data-edit="${escapeHtml(product.id)}">Edit</button><button type="button" class="small-btn danger-text" data-delete="${escapeHtml(product.id)}">Delete</button></div></td></tr>`;
  }).join(""):`<tr><td colspan="8" class="table-empty-cell">${query?"No matching products.":"No registered products yet. Add your first product to get started."}</td></tr>`;
  table.querySelectorAll("[data-edit]").forEach(button=>button.onclick=()=>{
    editProduct(button.dataset.edit);
    openModal("inventoryModal");
    $("productName").focus();
  });
  table.querySelectorAll("[data-delete]").forEach(button=>button.onclick=()=>deleteProduct(button.dataset.delete));
}
function addScannedProduct(event){
  event.preventDefault();
  const barcode=$("barcodeInput").value.trim().toLowerCase();
  const message=$("barcodeMessage");
  if(!barcode){message.textContent="Scan a barcode or enter an item code.";return}
  const product=state.products.find(item=>String(item.barcode||"").trim().toLowerCase()===barcode);
  if(!product){message.textContent=`No registered product matches “${$("barcodeInput").value.trim()}”. Add it in Registered Products.`;$("barcodeInput").select();return}
  if(addToCart(product.id)){
    message.textContent=`${product.name} added to the cart.`;
    $("barcodeInput").value="";
  }else message.textContent=`${product.name} could not be added. Check available stock.`;
  $("barcodeInput").focus();
}
function setVendorView(view){
  const isProducts=view==="products";
  $("posView").hidden=isProducts;
  $("registeredProductsView").hidden=!isProducts;
  $("posTab").classList.toggle("active",!isProducts);
  $("registeredProductsTab").classList.toggle("active",isProducts);
  $("posTab").setAttribute("aria-selected",String(!isProducts));
  $("registeredProductsTab").setAttribute("aria-selected",String(isProducts));
  if(isProducts)renderRegisteredProducts();
}

function addToCart(id){
  const p=state.products.find(x=>x.id===id); if(!p)return false;
  if(p.stock<=0){showToast(`${p.name} is out of stock`);return false}
  const item=state.cart.find(x=>x.productId===id); const qty=item?item.qty:0;
  if(qty>=p.stock){showToast("Not enough stock available");return false}
  item?item.qty++:state.cart.push({productId:id,qty:1}); renderCart(); showToast(`${p.name} added to cart`);return true;
}
function updateQty(id,change){
  const item=state.cart.find(x=>x.productId===id),p=state.products.find(x=>x.id===id); if(!item||!p)return;
  const q=item.qty+change; if(q<=0)state.cart=state.cart.filter(x=>x.productId!==id); else if(q<=p.stock)item.qty=q; else alert("Not enough stock available."); renderCart();
}
function removeFromCart(id){state.cart=state.cart.filter(x=>x.productId!==id);renderCart()}
function getCartDetails(){return state.cart.map(item=>{const product=state.products.find(p=>p.id===item.productId);return {...item,product,lineTotal:product?product.price*item.qty:0}}).filter(x=>x.product)}
function getTotals(){
  const subtotal=getCartDetails().reduce((s,i)=>s+i.lineTotal,0),raw=Number(els.discountInput.value)||0;
  let discount=els.discountType.value==="percent"?subtotal*Math.min(raw,100)/100:Math.min(raw,subtotal);
  return {subtotal,discount,total:Math.max(subtotal-discount,0)}
}
function renderCart(){
  const items=getCartDetails(),count=items.reduce((s,i)=>s+i.qty,0); els.cartCounter.textContent=`${count} item${count===1?"":"s"}`;
  if(!items.length)els.cartItems.innerHTML=`<div class="empty-state"><div class="empty-icon">🛍️</div><strong>Your cart is empty</strong><span>Add a souvenir to begin a sale.</span></div>`;
  else els.cartItems.innerHTML=items.map(i=>`<div class="cart-item">
    <img class="cart-thumb" src="${i.product.image||"assets/magnet.svg"}" alt="">
    <div><div class="cart-item-top"><div><div class="cart-item-name">${escapeHtml(i.product.name)}</div><div class="cart-item-price">${peso.format(i.product.price)} each</div></div><strong>${peso.format(i.lineTotal)}</strong></div>
    <div class="cart-controls"><button class="qty-btn" data-dec="${i.productId}">−</button><span>${i.qty}</span><button class="qty-btn" data-inc="${i.productId}">+</button><button class="remove-btn" data-remove="${i.productId}">Remove</button></div></div></div>`).join("");
  document.querySelectorAll("[data-dec]").forEach(b=>b.onclick=()=>updateQty(b.dataset.dec,-1));
  document.querySelectorAll("[data-inc]").forEach(b=>b.onclick=()=>updateQty(b.dataset.inc,1));
  document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>removeFromCart(b.dataset.remove));
  const t=getTotals(); els.subtotal.textContent=peso.format(t.subtotal); els.total.textContent=peso.format(t.total); updateChange();
}
function updateChange(){
  const {total}=getTotals(),method=els.paymentMethod.value; els.cashBlock.classList.toggle("hidden",method!=="Cash");
  if(method!=="Cash"){els.cashInput.value="";els.change.textContent=peso.format(0);return}
  els.change.textContent=peso.format(Math.max((Number(els.cashInput.value)||0)-total,0));
}
function clearCart(){state.cart=[];els.discountInput.value=0;els.cashInput.value="";renderCart()}
function checkout(){
  if(state.role!=="souvenir")return;
  const items=getCartDetails(); if(!items.length){alert("Cart is empty.");return}
  const {subtotal,discount,total}=getTotals(),method=els.paymentMethod.value,cash=Number(els.cashInput.value)||0;
  if(method==="Cash"&&cash<total){alert("Cash received is not enough.");return}
  for(const i of items){const p=state.products.find(x=>x.id===i.productId);if(!p||p.stock<i.qty){alert(`Insufficient stock for ${i.product?.name||"an item"}.`);return}}
  items.forEach(i=>{
    const product=state.products.find(x=>x.id===i.productId);
    product.stock-=i.qty;
    product.actualStock=Math.max(0,(Number(product.actualStock)||0)-i.qty);
  });
  const soldUnitCounts=new Map();
  const sale={id:`OR-${Date.now().toString().slice(-8)}`,date:new Date().toISOString(),items:items.map(i=>{
    const categoryPrefix=i.product.categoryBarcodePrefix||getCategoryBarcodePrefix(i.product.category);
    const categoryKey=normalizedCategory(i.product.category);
    const previousCount=soldUnitCounts.has(categoryKey)
      ?soldUnitCounts.get(categoryKey)
      :getSoldUnitCount(categoryPrefix);
    const soldBarcodes=getSoldBarcodes(categoryPrefix,i.qty,previousCount);
    soldUnitCounts.set(categoryKey,previousCount+i.qty);
    return {productId:i.productId,name:i.product.name,barcode:i.product.barcode,categoryBarcodePrefix:categoryPrefix,soldBarcodes,soldBarcode:soldBarcodes[0]||categoryPrefix,category:i.product.category,costPrice:i.product.costPrice!==null&&i.product.costPrice!==undefined&&Number.isFinite(Number(i.product.costPrice))?Number(i.product.costPrice):null,price:i.product.price,qty:i.qty,lineTotal:i.lineTotal};
  }),subtotal,discount,total,paymentMethod:method,cashReceived:method==="Cash"?cash:total,change:method==="Cash"?Math.max(cash-total,0):0};
  state.sales.unshift(sale);saveData();clearCart();renderProducts();renderInventory();renderRegisteredProducts();renderSales();renderReportsOverview();renderAdminDashboard();showReceipt(sale);
}
function renderInventory(){
  const canEdit=state.role==="souvenir"||state.role==="rgo";
  $("productForm").classList.toggle("hidden",!canEdit);
  $("inventoryActionsHeader").classList.toggle("hidden",!canEdit);
  if(!state.products.length){els.inventoryTable.innerHTML=`<tr><td colspan="${canEdit?8:7}">No products.</td></tr>`;return}
  els.inventoryTable.innerHTML=state.products.map(p=>{
    const stock=Number(p.stock)||0,actualStock=Number(p.actualStock)||0,unaccounted=stock!==actualStock;
    const status=unaccounted?"Unaccounted":stock===0?"Sold":"In stock";
    return `<tr><td>${escapeHtml(p.name)}</td><td><code class="barcode-cell">${escapeHtml(p.barcode||"")}</code></td><td>${escapeHtml(p.category)}</td><td>${peso.format(p.price)}</td><td>${stock}</td><td>${actualStock}</td><td><span class="inventory-status ${unaccounted?"unaccounted":stock===0?"out":"in"}">${unaccounted?"⚠ RGO · ":""}${status}</span></td>${canEdit?`<td><button class="small-btn" data-edit="${escapeHtml(p.id)}">Edit</button> <button class="small-btn danger-text" data-delete="${escapeHtml(p.id)}">Delete</button></td>`:""}</tr>`;
  }).join("");
  if(canEdit){
    document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editProduct(b.dataset.edit));
    document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteProduct(b.dataset.delete));
  }
}
function editProduct(id){if(state.role!=="souvenir"&&state.role!=="rgo")return;const p=state.products.find(x=>x.id===id);if(!p)return;$("productId").value=p.id;$("productName").value=p.name;$("productBarcode").value=p.barcode||"";$("productCategory").value=p.category;$("productPrice").value=p.price;$("productCost").value=p.costPrice??"";$("productStock").value=p.stock;$("productActualStock").value=Number(p.actualStock)||0}
function resetProductForm(){$("productForm").reset();$("productId").value="";$("productBarcode").value="";$("productActualStock").value="";$("productCost").value="";$("productFormMessage").textContent=""}
function saveProduct(e){
  e.preventDefault(); if(state.role!=="souvenir"&&state.role!=="rgo")return; const id=$("productId").value,name=$("productName").value.trim(),category=$("productCategory").value.trim(),price=Number($("productPrice").value),costValue=$("productCost").value.trim(),costPrice=costValue===""?null:Number(costValue),stock=Number($("productStock").value),actualStock=Number($("productActualStock").value);
  if(!name||!category||!Number.isFinite(price)||price<0||(costPrice!==null&&(!Number.isFinite(costPrice)||costPrice<0))||!Number.isInteger(stock)||stock<0||!Number.isInteger(actualStock)||actualStock<0){$("productFormMessage").textContent="Enter valid non-negative prices and whole-number stock counts.";return}
  const existingProduct=id?state.products.find(product=>product.id===id):null;
  let barcode=$("productBarcode").value.trim();
  if(!barcode||(existingProduct&&normalizedCategory(existingProduct.category)!==normalizedCategory(category)&&barcode===existingProduct.barcode))barcode=getNextCategoryBarcode(category,id);
  const categoryBarcodePrefix=getCategoryBarcodePrefix(category);
  const duplicate=state.shops.some(shop=>shop.products.some(product=>product.id!==id&&String(product.barcode||"").trim().toLowerCase()===barcode.toLowerCase()));
  if(duplicate){$("productBarcode").setCustomValidity("This barcode is already assigned to another product.");$("productBarcode").reportValidity();return}
  $("productBarcode").setCustomValidity("");
  if(id){const p=existingProduct;if(p)Object.assign(p,{name,barcode,category,categoryBarcodePrefix,price,costPrice,stock,actualStock,updatedAt:new Date().toISOString()})}
  else state.products.push({id:crypto.randomUUID(),name,barcode,category,categoryBarcodePrefix,price,costPrice,stock,actualStock,updatedAt:new Date().toISOString(),image:fallbackImages[state.products.length%fallbackImages.length]});
  saveData();resetProductForm();renderCategories();renderProducts();renderInventory();renderRegisteredProducts();renderReportsOverview();renderAdminDashboard();showToast("Product saved");
}
function deleteProduct(id){if(state.role!=="souvenir"&&state.role!=="rgo")return;const p=state.products.find(x=>x.id===id);if(!p||!confirm(`Delete "${p.name}"?`))return;state.products=state.products.filter(x=>x.id!==id);state.cart=state.cart.filter(x=>x.productId!==id);saveData();renderCategories();renderProducts();renderInventory();renderRegisteredProducts();renderCart();renderReportsOverview();renderAdminDashboard()}
function dateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`}
function getVisibleSales(){
  if(state.role!=="rgo")return state.sales;
  const period=$("salesPeriod").value,selectedPeriod=period==="monthly"?$("salesReportMonth").value:$("salesReportDate").value;
  return state.sales.filter(sale=>{
    const saleDate=dateKey(new Date(sale.date));
    return period==="monthly"?saleDate.slice(0,7)===selectedPeriod:saleDate===selectedPeriod;
  });
}
function renderSales(){
  const visibleSales=getVisibleSales(),isRgo=state.role==="rgo",period=$("salesPeriod").value;
  els.salesCount.textContent=visibleSales.length;els.salesRevenue.textContent=peso.format(visibleSales.reduce((s,x)=>s+x.total,0));
  $("salesCountCaption").textContent=isRgo?`Selected ${period==="daily"?"day's":"month's"} completed sales`:"Completed sales";
  $("salesRevenueCaption").textContent=isRgo?`Selected ${period==="daily"?"day's":"month's"} revenue`:"All-time revenue";
  if(!visibleSales.length){els.salesTable.innerHTML=`<tr><td colspan="7">${isRgo?"No sales for this period.":"No sales yet."}</td></tr>`;return}
  els.salesTable.innerHTML=visibleSales.map(s=>`<tr><td>${escapeHtml(s.id)}</td><td>${new Date(s.date).toLocaleString("en-PH")}</td><td>${s.items.reduce((a,b)=>a+(Number(b.qty)||0),0)}</td><td>${s.items.map(item=>`<div class="sale-barcode-entry"><span>${escapeHtml(item.name)}</span><div>${getItemSoldBarcodes(item,item.categoryBarcodePrefix).map(barcode=>`<code class="barcode-cell">${escapeHtml(barcode)}</code>`).join(" ")}</div></div>`).join("")}</td><td>${escapeHtml(s.paymentMethod)}</td><td>${peso.format(s.total)}</td><td><button class="small-btn" data-receipt="${escapeHtml(s.id)}">View</button></td></tr>`).join("");
  document.querySelectorAll("[data-receipt]").forEach(b=>b.onclick=()=>{const s=state.sales.find(x=>x.id===b.dataset.receipt);if(s)showReceipt(s)});
}
function showReceipt(sale){
  els.receiptContent.innerHTML=`<div class="receipt"><h2>PUP SOUVENIR SHOP</h2><p>Memories made local 🇵🇭</p><hr>
  <div class="receipt-row"><span>Receipt</span><span>${sale.id}</span></div><div class="receipt-row"><span>Date</span><span>${new Date(sale.date).toLocaleString("en-PH")}</span></div><div class="receipt-row"><span>Payment</span><span>${sale.paymentMethod}</span></div><hr>
  ${sale.items.map(i=>`<div class="receipt-item"><div>${escapeHtml(i.name)}</div><small><span>Barcodes ${getItemSoldBarcodes(i,i.categoryBarcodePrefix).map(escapeHtml).join(", ")||"—"} · ${i.qty} × ${peso.format(i.price)}</span><span>${peso.format(i.lineTotal)}</span></small></div>`).join("")}<hr>
  <div class="receipt-row"><span>Subtotal</span><span>${peso.format(sale.subtotal)}</span></div><div class="receipt-row"><span>Discount</span><span>${peso.format(sale.discount)}</span></div><div class="receipt-row"><strong>TOTAL</strong><strong>${peso.format(sale.total)}</strong></div><div class="receipt-row"><span>Paid</span><span>${peso.format(sale.cashReceived)}</span></div><div class="receipt-row"><span>Change</span><span>${peso.format(sale.change)}</span></div><hr><p>Salamat! Please come again.</p></div>`;
  openModal("receiptModal");
}
function openModal(id){$(id).classList.remove("hidden")} function closeModal(id){$(id).classList.add("hidden")}

els.searchInput.oninput=e=>{state.search=e.target.value;renderProducts()}; els.discountInput.oninput=renderCart; els.discountType.onchange=renderCart; els.cashInput.oninput=updateChange;
if($("barcodeForm"))$("barcodeForm").onsubmit=addScannedProduct;
if($("registeredProductSearch"))$("registeredProductSearch").oninput=renderRegisteredProducts;
$("posTab").onclick=()=>setVendorView("pos");
$("registeredProductsTab").onclick=()=>setVendorView("products");
$("registeredAddProduct").onclick=()=>{resetProductForm();renderInventory();openModal("inventoryModal");$("productName").focus()};
$("generateBarcodeBtn").onclick=()=>{$("productBarcode").value=getNextCategoryBarcode($("productCategory").value,$("productId").value);$("productBarcode").setCustomValidity("");$("productBarcode").focus()};
$("productStock").oninput=()=>{if(!$("productId").value)$("productActualStock").value=$("productStock").value};
$("productBarcode").oninput=()=>$("productBarcode").setCustomValidity("");
document.querySelectorAll(".pay-method").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".pay-method").forEach(x=>x.classList.remove("active"));btn.classList.add("active");els.paymentMethod.value=btn.dataset.method;updateChange()});
$("clearCartBtn").onclick=clearCart;$("checkoutBtn").onclick=checkout;$("inventoryBtn").onclick=()=>{renderInventory();openModal("inventoryModal")};$("salesBtn").onclick=()=>{if(state.role==="rgo"){renderNotifications();openModal("notificationModal")}else{renderSales();openModal("salesModal")}};
$("productForm").onsubmit=saveProduct;$("resetProductForm").onclick=resetProductForm;$("printReceiptBtn").onclick=()=>window.print();
function updateSalesPeriodControls(){
  const monthly=$("salesPeriod").value==="monthly";
  $("salesReportDate").classList.toggle("hidden",monthly);
  $("salesReportDateLabel").classList.toggle("hidden",monthly);
  $("salesReportMonth").classList.toggle("hidden",!monthly);
  $("salesReportMonthLabel").classList.toggle("hidden",!monthly);
  renderSales();
}
$("salesPeriod").onchange=updateSalesPeriodControls;
$("salesReportDate").onchange=renderSales;$("salesReportMonth").onchange=renderSales;
function login(event,role){
  event.preventDefault();
  const form=event.currentTarget,username=form.elements.username.value.trim().toLowerCase(),password=form.elements.password.value;
  const credentials=LOGIN_CREDENTIALS[role],error=form.querySelector(".login-error");
  if(username!==credentials.username||password!==credentials.password){
    error.textContent="Incorrect username or password. Please try again.";
    error.classList.remove("hidden");
    form.elements.password.value="";
    form.elements.password.focus();
    return;
  }
  error.textContent="";
  error.classList.add("hidden");
  form.elements.username.value="";
  form.elements.password.value="";
  applyRole(role);
}
function applyRole(role){
  if(role!=="souvenir"&&role!=="rgo"){state.role=null;$("appShell").classList.add("hidden");$("loginScreen").classList.remove("hidden");return}
  state.role=role;
  $("loginScreen").classList.add("hidden");$("appShell").classList.remove("hidden");
  const isRgo=role==="rgo";
  $("appBrandTitle").textContent=isRgo?"SinTalaan":state.currentShop.name;
  $("appBrandSubtitle").textContent=isRgo?"PUP Resource Generation Office · Sales & inventory":state.currentShop.id==="pup-souvenir-shop"?"Local finds • Happy memories":"Shop Staff | Point of Sale and Store Management";
  $("clock").classList.toggle("hidden",isRgo);
  $("inventoryBtn").classList.toggle("hidden",isRgo);
  $("documentsBtn").classList.toggle("hidden",isRgo);
  $("salesBtn").textContent=isRgo?"🔔 Notification":"📈 Sales";
  $("roleBadge").textContent=role==="rgo"?"RGO · Admin":"Shop Staff";
  $("posLayout").classList.toggle("hidden",isRgo);
  $("rgoDashboard").classList.toggle("hidden",!isRgo);
  $("rgoSalesPeriod").classList.toggle("hidden",!isRgo);
  $("salesPeriod").value="daily";
  const today=dateKey(new Date());
  $("salesReportDate").value=today;
  $("salesReportMonth").value=today.slice(0,7);
  updateSalesPeriodControls();
  setVendorView("pos");
  renderInventory();
  renderRegisteredProducts();
  if(isRgo){
    activateAdminView("home");
    renderAdminDashboard();
    renderDocuments();
  }
}
function renderNotifications(){
  const notifications=[];
  const notificationShops=state.role==="rgo"?getReportShops():[state.currentShop];
  notificationShops.forEach(shop=>shop.products.filter(product=>product.stock<=lowStockThreshold).forEach(product=>{
    const status=product.stock===0?"is out of stock":`is running low (${product.stock} left)`;
    notifications.push({title:product.stock===0?"Out of stock":"Low stock",message:`${escapeHtml(product.name)} ${status}${state.role==="rgo"?` · ${escapeHtml(shop.name)}`:""}.`});
  }));
  const latestSale=notificationShops.flatMap(shop=>shop.sales.map(sale=>({shop,sale}))).sort((a,b)=>new Date(b.sale.date)-new Date(a.sale.date))[0];
  if(latestSale){
    notifications.push({
      title:"Latest sale recorded",
      message:`Receipt ${escapeHtml(latestSale.sale.id)} · ${escapeHtml(latestSale.shop.name)} · ${peso.format(latestSale.sale.total)} · ${new Date(latestSale.sale.date).toLocaleString("en-PH")}`
    });
  }
  $("notificationList").innerHTML=notifications.length
    ?notifications.map(notification=>`<article class="notification-item"><strong>${notification.title}</strong><p>${notification.message}</p></article>`).join("")
    :`<p class="notification-empty">You're all caught up. There are no new notifications.</p>`;
}
function renderShopSelector(){
  const selector=$("shopSelect");
  if(!selector)return;
  selector.innerHTML=`<option value="__all_shops__">All registered shops</option>`
    +state.shops.filter(shop=>!shop.archived).map(shop=>`<option value="${escapeHtml(shop.id)}">${escapeHtml(shop.name)}</option>`).join("")
    +`<option value="__add_shop__">＋ Add another shop</option>`;
  selector.value=state.reportShopId;
  $("shopOverviewTitle").textContent=state.reportShopId==="__all_shops__"?"Consolidated Reports Overview":`${state.shops.find(shop=>shop.id===state.reportShopId)?.name||"Shop"} Reports Overview`;
  loadDailyReportDetails();
  renderReportsOverview();
  renderAdminDashboard();
}
function selectShop(shopId){
  if(shopId==="__add_shop__"){
    $("shopSelect").value=state.selectedShopId;
    $("newShopName").value="";
    $("addShopError").textContent="";
    $("addShopError").classList.add("hidden");
    openModal("addShopModal");
    $("newShopName").focus();
    return;
  }
  if(shopId==="__all_shops__"){
    state.reportShopId=shopId;
    renderShopSelector();
    return;
  }
  if(!state.shops.some(shop=>shop.id===shopId&&!shop.archived))return;
  state.reportShopId=shopId;
  state.selectedShopId=shopId;
  state.cart=[];
  saveData();
  renderShopSelector();
  renderCategories();
  renderProducts();
  renderRegisteredProducts();
  renderCart();
  renderInventory();
  renderSales();
  renderReportsOverview();
}
function getReportShops(){
  return state.reportShopId==="__all_shops__"
    ?state.shops.filter(shop=>!shop.archived)
    :state.shops.filter(shop=>shop.id===state.reportShopId&&!shop.archived);
}
function renderAdminDashboard(){
  if(!$("adminShopList"))return;
  const activeShops=state.shops.filter(shop=>!shop.archived);
  const archivedShops=state.shops.filter(shop=>shop.archived);
  const selectedShops=getReportShops();
  const today=dateKey(new Date());
  const products=selectedShops.flatMap(shop=>shop.products.map(product=>({shop,product})));
  const sales=selectedShops.flatMap(shop=>shop.sales.map(sale=>({shop,sale})));
  const todaysSales=sales.filter(({sale})=>dateKey(new Date(sale.date))===today);
  const grossToday=todaysSales.reduce((sum,{sale})=>sum+(Number(sale.total)||0),0);
  const lowStock=products.filter(({product})=>Number(product.stock)<=lowStockThreshold);
  const unaccountedProducts=products.filter(({product})=>Number(product.stock)!==Number(product.actualStock));
  $("dashShopCount").textContent=activeShops.length.toLocaleString("en-PH");
  $("dashProductCount").textContent=products.length.toLocaleString("en-PH");
  $("dashSalesToday").textContent=peso.format(grossToday);
  $("dashTransactionsToday").textContent=`${todaysSales.length} transaction${todaysSales.length===1?"":"s"} today`;
  $("dashInventoryAlerts").textContent=(lowStock.length+unaccountedProducts.length).toLocaleString("en-PH");
  $("dashPendingReports").textContent="0";
  $("dashInStock").textContent=products.filter(({product})=>Number(product.stock)>0&&Number(product.stock)===Number(product.actualStock)).length.toLocaleString("en-PH");
  $("dashLowStock").textContent=products.filter(({product})=>Number(product.stock)>0&&Number(product.stock)<=lowStockThreshold).length.toLocaleString("en-PH");
  $("dashOutStock").textContent=products.filter(({product})=>Number(product.stock)<=0).length.toLocaleString("en-PH");
  $("dashUnaccounted").textContent=unaccountedProducts.length.toLocaleString("en-PH");
  $("dashboardDate").textContent=new Date().toLocaleDateString("en-PH",{weekday:"long",month:"long",day:"numeric"});
  $("adminShopList").innerHTML=activeShops.map(shop=>`<button type="button" class="admin-shop-link ${state.reportShopId===shop.id?"selected":""}" data-admin-shop="${escapeHtml(shop.id)}"><span class="shop-link-dot"></span><span>${escapeHtml(shop.name)}</span></button>`).join("")||`<p class="sidebar-empty">No active shops yet.</p>`;
  $("archivedShopList").innerHTML=archivedShops.map(shop=>`<button type="button" class="archived-shop-link" data-restore-shop="${escapeHtml(shop.id)}">${escapeHtml(shop.name)} <span>Restore</span></button>`).join("")||`<p class="sidebar-empty">No archived shops.</p>`;
  $("adminShopCards").innerHTML=activeShops.map(shop=>{
    const shopProducts=shop.products||[];
    const shopSales=(shop.sales||[]).filter(sale=>dateKey(new Date(sale.date))===today);
    const alerts=shopProducts.filter(product=>Number(product.stock)<=lowStockThreshold).length;
    return `<article class="managed-shop-card"><div class="managed-shop-top"><span class="shop-monogram">${escapeHtml(shop.name.slice(0,1).toUpperCase())}</span><button type="button" class="shop-menu-button" data-rename-shop="${escapeHtml(shop.id)}" aria-label="Rename ${escapeHtml(shop.name)}">•••</button></div><h4>${escapeHtml(shop.name)}</h4><p>${shopProducts.length} registered product${shopProducts.length===1?"":"s"}</p><div class="managed-shop-meta"><span>${shopSales.length} sale${shopSales.length===1?"":"s"} today</span><span class="${alerts?"alert-text":"healthy-text"}">${alerts?`${alerts} stock alert${alerts===1?"":"s"}`:"Stock healthy"}</span></div><button type="button" class="shop-open-button" data-admin-shop="${escapeHtml(shop.id)}">View shop dashboard <span>→</span></button><button type="button" class="shop-archive-button" data-archive-shop="${escapeHtml(shop.id)}">Archive shop</button></article>`;
  }).join("")||`<div class="admin-empty">No shops have been added yet. Create a shop to start tracking sales and stock.</div>`;
  const activityRows=sales.slice().sort((a,b)=>new Date(b.sale.date)-new Date(a.sale.date)).slice(0,5);
  $("adminReminderList").innerHTML=activityRows.length?activityRows.map(({shop,sale})=>`<article class="activity-row"><span class="activity-icon">↗</span><div><strong>Sale recorded · ${escapeHtml(shop.name)}</strong><p>Receipt ${escapeHtml(sale.id)} · ${sale.items.reduce((sum,item)=>sum+(Number(item.qty)||0),0)} items</p></div><span class="activity-amount">${peso.format(Number(sale.total)||0)}</span><time>${new Date(sale.date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})}</time></article>`).join(""):`<div class="admin-empty compact-empty">No recent sales activity yet.</div>`;
  renderSalesTrend(sales);
  renderPaymentReminders();
  document.querySelectorAll("[data-admin-shop]").forEach(button=>button.onclick=()=>selectShop(button.dataset.adminShop));
  document.querySelectorAll("[data-restore-shop]").forEach(button=>button.onclick=()=>restoreShop(button.dataset.restoreShop));
  document.querySelectorAll("[data-rename-shop]").forEach(button=>button.onclick=()=>renameShop(button.dataset.renameShop));
  document.querySelectorAll("[data-archive-shop]").forEach(button=>button.onclick=()=>archiveShop(button.dataset.archiveShop));
}
function paymentReminderStatus(reminder,today=dateKey(new Date())){
  if(reminder.paidAt)return "Paid";
  return reminder.dueDate<today?"Overdue":"Upcoming";
}
function savePaymentReminders(){
  try{
    localStorage.setItem(PAYMENT_REMINDERS_STORAGE_KEY,JSON.stringify(paymentReminders));
    return true;
  }catch(storageError){
    console.error("Could not save payment reminders.",storageError);
    return false;
  }
}
function renderPaymentReminders(){
  const table=$("paymentRemindersTable");
  if(!table)return;
  const shopSelect=$("reminderShop");
  const previousShopId=shopSelect.value;
  const activeShops=state.shops.filter(shop=>!shop.archived);
  shopSelect.innerHTML=activeShops.map(shop=>`<option value="${escapeHtml(shop.id)}">${escapeHtml(shop.name)}</option>`).join("");
  if(activeShops.some(shop=>shop.id===previousShopId))shopSelect.value=previousShopId;
  else if(activeShops.some(shop=>shop.id===state.currentShop.id))shopSelect.value=state.currentShop.id;
  const visibleReminders=paymentReminders
    .filter(reminder=>state.reportShopId==="__all_shops__"||reminder.shopId===state.reportShopId)
    .sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const statusClass=status=>status.toLowerCase();
  table.innerHTML=visibleReminders.length?visibleReminders.map(reminder=>{
    const shop=state.shops.find(item=>item.id===reminder.shopId);
    const status=paymentReminderStatus(reminder);
    return `<tr><td>${escapeHtml(shop?.name||"Archived shop")}</td><td>${escapeHtml(reminder.dueDate)}</td><td>${peso.format(Number(reminder.amount)||0)}</td><td><span class="payment-status ${statusClass(status)}">${status}</span></td><td><div class="document-actions"><button type="button" class="small-btn" data-toggle-reminder="${escapeHtml(reminder.id)}">${reminder.paidAt?"Mark unpaid":"Mark paid"}</button><button type="button" class="small-btn danger-text" data-delete-reminder="${escapeHtml(reminder.id)}">Delete</button></div></td></tr>`;
  }).join(""):`<tr><td colspan="5" class="table-empty-cell">No payment reminders set for this shop.</td></tr>`;
  const dashboard=$("adminPaymentReminderList");
  if(dashboard){
    const dashboardRows=visibleReminders.slice(0,5);
    dashboard.innerHTML=dashboardRows.length?dashboardRows.map(reminder=>{
      const shop=state.shops.find(item=>item.id===reminder.shopId);
      const status=paymentReminderStatus(reminder);
      return `<article class="reminder-item"><span class="reminder-icon ${status.toLowerCase()}">${status==="Paid"?"✓":"₱"}</span><div><strong>${status} · ${escapeHtml(shop?.name||"Archived shop")}</strong><p>Due ${escapeHtml(reminder.dueDate)} · ${peso.format(Number(reminder.amount)||0)}</p></div><span class="payment-status ${status.toLowerCase()}">${status}</span></article>`;
    }).join(""):`<div class="reminder-empty">No payment reminders. Add one in Financial reports.</div>`;
  }
  table.querySelectorAll("[data-toggle-reminder]").forEach(button=>button.onclick=()=>{
    const reminder=paymentReminders.find(item=>item.id===button.dataset.toggleReminder);
    if(!reminder)return;
    const previousPaidAt=reminder.paidAt;
    if(previousPaidAt)delete reminder.paidAt;
    else reminder.paidAt=new Date().toISOString();
    if(!savePaymentReminders()){
      if(previousPaidAt)reminder.paidAt=previousPaidAt;
      else delete reminder.paidAt;
      alert("The payment status could not be saved in this browser.");
      return;
    }
    renderPaymentReminders();
  });
  table.querySelectorAll("[data-delete-reminder]").forEach(button=>button.onclick=()=>{
    const index=paymentReminders.findIndex(item=>item.id===button.dataset.deleteReminder);
    if(index<0||!confirm("Delete this payment reminder?"))return;
    const [removed]=paymentReminders.splice(index,1);
    if(!savePaymentReminders()){
      paymentReminders.splice(index,0,removed);
      alert("The payment reminder could not be deleted from browser storage.");
      return;
    }
    renderPaymentReminders();
  });
}
function addPaymentReminder(event){
  event.preventDefault();
  const shopId=$("reminderShop").value;
  const dueDate=$("reminderDueDate").value;
  const amount=Number($("reminderAmount").value);
  const message=$("paymentReminderMessage");
  if(!state.shops.some(shop=>shop.id===shopId&&!shop.archived)||!dueDate||!Number.isFinite(amount)||amount<0){
    message.textContent="Choose an active shop, a due date, and a valid non-negative amount.";
    return;
  }
  const reminder={id:crypto.randomUUID(),shopId,dueDate,amount};
  paymentReminders.push(reminder);
  if(!savePaymentReminders()){
    paymentReminders.pop();
    message.textContent="The reminder could not be saved in this browser.";
    return;
  }
  $("paymentReminderForm").reset();
  message.textContent="Payment reminder added.";
  renderPaymentReminders();
  renderAdminDashboard();
}
function renderSalesTrend(sales){
  const chart=$("salesTrendChart");
  if(!chart)return;
  const days=Array.from({length:7},(_,index)=>{
    const date=new Date();
    date.setDate(date.getDate()-(6-index));
    const key=dateKey(date);
    const total=sales.filter(({sale})=>dateKey(new Date(sale.date))===key).reduce((sum,{sale})=>sum+(Number(sale.subtotal)||Number(sale.total)||0),0);
    return {date,key,total,label:date.toLocaleDateString("en-PH",{weekday:"short"})};
  });
  const max=Math.max(...days.map(day=>day.total),1);
  const points=days.map((day,index)=>`${34+index*110},${142-(day.total/max)*112}`);
  const total=days.reduce((sum,day)=>sum+day.total,0);
  $("chartTotalSales").textContent=peso.format(total);
  chart.innerHTML=`<svg viewBox="0 0 760 190" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8b2332" stop-opacity=".16"/><stop offset="100%" stop-color="#8b2332" stop-opacity="0"/></linearGradient></defs><path class="chart-gridline" d="M24 30H746 M24 86H746 M24 142H746"/><path class="chart-area" d="M${points.join(" L")} L694 154 L34 154 Z"/><polyline class="chart-line" points="${points.join(" ")}"/>${points.map(point=>{const [x,y]=point.split(",");return `<circle class="chart-point" cx="${x}" cy="${y}" r="4"/>`}).join("")}${days.map((day,index)=>`<text class="chart-label" x="${34+index*110}" y="178" text-anchor="middle">${day.label}</text>`).join("")}</svg>${total===0?`<span class="chart-empty-hint">Sales trend will appear when transactions are recorded.</span>`:""}`;
}
function renderDocuments(audience="admin"){
  const isStaff=audience==="staff";
  const table=$(isStaff?"staffDocumentsTable":"documentsTable");
  if(!table)return;
  const selectedCategory=isStaff?"all":$("documentCategoryFilter").value;
  const visibleDocuments=documents.filter(document=>{
    const belongsToShop=!isStaff||document.shopId===state.currentShop.id;
    return belongsToShop&&(selectedCategory==="all"||document.category===selectedCategory);
  }).sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt));
  const columns=isStaff?4:5;
  table.innerHTML=visibleDocuments.length?visibleDocuments.map(document=>`<tr><td class="document-name-cell"><span class="file-type-mark">${escapeHtml((document.name.split(".").pop()||"FILE").slice(0,4).toUpperCase())}</span>${escapeHtml(document.name)}</td><td>${escapeHtml(document.category)}</td><td>${new Date(document.uploadedAt).toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"})}</td>${isStaff?"":`<td>${escapeHtml(state.shops.find(shop=>shop.id===document.shopId)?.name||"Archived shop")}</td>`}<td><div class="document-actions"><button class="small-btn" type="button" data-preview-document="${escapeHtml(document.id)}">Preview</button><button class="small-btn" type="button" data-download-document="${escapeHtml(document.id)}">Download</button><button class="small-btn danger-text" type="button" data-delete-document="${escapeHtml(document.id)}">Delete</button></div></td></tr>`).join(""):`<tr><td colspan="${columns}" class="table-empty-cell">No documents uploaded yet.</td></tr>`;
  document.querySelectorAll("[data-preview-document]").forEach(button=>button.onclick=()=>openDocument(button.dataset.previewDocument));
  document.querySelectorAll("[data-download-document]").forEach(button=>button.onclick=()=>downloadDocument(button.dataset.downloadDocument));
  document.querySelectorAll("[data-delete-document]").forEach(button=>button.onclick=()=>deleteDocument(button.dataset.deleteDocument));
}
function saveUploadedDocument(file,category){
  if(!file)return;
  const extension=file.name.split(".").pop().toLowerCase();
  if(!["pdf","jpg","jpeg","png","docx"].includes(extension)){alert("Choose a PDF, JPG, PNG, or DOCX file.");return}
  if(file.size>2*1024*1024){alert("Files must be 2 MB or smaller to fit browser storage.");return}
  const reader=new FileReader();
  reader.onerror=()=>alert("The selected document could not be read. Try another file.");
  reader.onload=()=>{
    const documentRecord={id:crypto.randomUUID(),name:file.name,category,uploadedAt:new Date().toISOString(),shopId:state.currentShop.id,dataUrl:reader.result};
    documents.unshift(documentRecord);
    try{localStorage.setItem(DOCUMENTS_STORAGE_KEY,JSON.stringify(documents))}
    catch(storageError){documents.shift();console.error("Could not save uploaded document.",storageError);alert("The document could not be saved. Browser storage may be full.");return}
    renderDocuments("admin");
    renderDocuments("staff");
    showToast("Document uploaded");
  };
  reader.readAsDataURL(file);
}
function findDocument(documentId){
  const record=documents.find(document=>document.id===documentId);
  if(!record||state.role==="souvenir"&&record.shopId!==state.currentShop.id)return null;
  return record;
}
function openDocument(documentId){
  const record=findDocument(documentId);
  if(!record)return;
  if(!["pdf","jpg","jpeg","png"].includes(record.name.split(".").pop().toLowerCase())){showToast("Preview is unavailable for DOCX files");return}
  const preview=window.open(record.dataUrl,"_blank","noopener");
  if(!preview)showToast("Allow pop-ups to preview this document");
}
function downloadDocument(documentId){
  const record=findDocument(documentId);
  if(!record)return;
  const link=document.createElement("a");
  link.href=record.dataUrl;
  link.download=record.name;
  document.body.append(link);
  link.click();
  link.remove();
}
function deleteDocument(documentId){
  const record=findDocument(documentId);
  if(!record||!confirm(`Delete "${record.name}"?`))return;
  const previousDocuments=documents;
  documents=documents.filter(document=>document.id!==documentId);
  try{localStorage.setItem(DOCUMENTS_STORAGE_KEY,JSON.stringify(documents))}
  catch(storageError){documents=previousDocuments;console.error("Could not delete the document.",storageError);alert("The document could not be deleted from browser storage.");return}
  renderDocuments("admin");
  renderDocuments("staff");
  showToast("Document deleted");
}
function activateAdminView(view){
  const descriptions={
    home:["Overview","A clear view of sales and inventory across your campus shops."],
    sales:["Daily sales","Review transactions, receipts, and sold-product barcodes by date range."],
    inventory:["Inventory monitoring","Compare physical counts with system stock and review RGO warnings."],
    reports:["Financial reports","Review quarterly statements, royalty totals, and payment reminders."],
    documents:["Documents","Manage supporting purchase proofs, receipts, and other shop files."],
    users:["User management","Create demo accounts and manage shop and administrator access."],
    settings:["System settings","Configure inventory alert thresholds for this browser."]
  };
  if(!descriptions[view])return;
  document.querySelectorAll("[data-admin-panel]").forEach(panel=>panel.classList.toggle("active",panel.dataset.adminPanel===view));
  document.querySelectorAll(".admin-nav[data-admin-view]").forEach(button=>button.classList.toggle("active",button.dataset.adminView===view));
  $("adminPageTitle").textContent=descriptions[view][0];
  $("adminPageDescription").textContent=descriptions[view][1];
  if(view==="documents")renderDocuments("admin");
  if(view==="users")renderAccounts();
  if(view==="settings")$("lowStockThreshold").value=String(lowStockThreshold);
  if(view==="reports"){renderReportsOverview();renderPaymentReminders();$("adminPageTitle").scrollIntoView({block:"start",behavior:"smooth"})}
}
function renderAccounts(){
  const table=$("usersTable");
  if(!table)return;
  table.innerHTML=accounts.length?accounts.map((account,index)=>{
    const isDefault=LOGIN_CREDENTIALS[account.role]?.username===account.username;
    const roleLabel=account.role==="rgo"?"Admin":"Shop Staff";
    return `<tr><td>${escapeHtml(account.username)}</td><td><span class="user-role-chip ${account.role==="rgo"?"admin":"staff"}">${roleLabel}</span></td><td>${isDefault?"Demo account":"Registered locally"}</td><td>${isDefault?`<span class="report-help">Protected</span>`:`<button type="button" class="small-btn danger-text" data-remove-user="${index}">Remove</button>`}</td></tr>`;
  }).join(""):`<tr><td colspan="4" class="table-empty-cell">No registered users.</td></tr>`;
  document.querySelectorAll("[data-remove-user]").forEach(button=>button.onclick=()=>removeAccount(Number(button.dataset.removeUser)));
}
function createAccount(event){
  event.preventDefault();
  const username=$("userUsername").value.trim().toLowerCase();
  const password=$("userPassword").value;
  const role=$("userRole").value;
  const message=$("userFormMessage");
  message.textContent="";
  if(username.length<3||password.length<6){message.textContent="Use a username with at least 3 characters and a password with at least 6.";return}
  if(accounts.some(account=>account.role===role&&account.username===username)){message.textContent="That username already exists for this role.";return}
  const account={role,username,password};
  accounts.push(account);
  try{localStorage.setItem(ACCOUNTS_STORAGE_KEY,JSON.stringify(accounts))}
  catch(storageError){accounts.pop();console.error("Could not save the new user.",storageError);message.textContent="Could not save this account. Check browser storage.";return}
  $("userForm").reset();
  message.textContent="User created. Share the temporary password securely.";
  renderAccounts();
}
function removeAccount(index){
  const account=accounts[index];
  if(!account||LOGIN_CREDENTIALS[account.role]?.username===account.username)return;
  if(!confirm(`Remove the ${account.role==="rgo"?"admin":"shop staff"} account "${account.username}"?`))return;
  const [removed]=accounts.splice(index,1);
  try{localStorage.setItem(ACCOUNTS_STORAGE_KEY,JSON.stringify(accounts))}
  catch(storageError){accounts.splice(index,0,removed);console.error("Could not remove the user.",storageError);alert("The account could not be removed from browser storage.");return}
  renderAccounts();
  showToast("User removed");
}
function saveSettings(event){
  event.preventDefault();
  const input=$("lowStockThreshold");
  const value=Number(input.value);
  const message=$("settingsMessage");
  if(!Number.isInteger(value)||value<1||value>1000){message.textContent="Enter a whole number from 1 to 1000.";return}
  const previousValue=lowStockThreshold;
  lowStockThreshold=value;
  try{localStorage.setItem(SETTINGS_STORAGE_KEY,JSON.stringify({lowStockThreshold}))}
  catch(storageError){lowStockThreshold=previousValue;console.error("Could not save system settings.",storageError);message.textContent="Settings could not be saved in this browser.";return}
  message.textContent="Settings saved.";
  renderAdminDashboard();
  renderReportsOverview();
  renderProducts();
}
function renameShop(shopId){
  const shop=state.shops.find(item=>item.id===shopId);
  if(!shop)return;
  const name=prompt("Enter a new shop name:",shop.name)?.trim();
  if(!name||name===shop.name)return;
  if(state.shops.some(item=>item.id!==shopId&&item.name.toLocaleLowerCase()===name.toLocaleLowerCase())){alert("A shop with that name already exists.");return}
  const previousName=shop.name;
  shop.name=name;
  try{saveData()}catch(storageError){shop.name=previousName;console.error("Could not save the updated shop name.",storageError);alert("The shop name could not be saved in this browser.");return}
  renderShopSelector();
  renderAdminDashboard();
  showToast("Shop name updated");
}
function archiveShop(shopId){
  const shop=state.shops.find(item=>item.id===shopId&&!item.archived);
  if(!shop||!confirm(`Archive "${shop.name}"? Its sales and inventory will be retained.`))return;
  shop.archived=true;
  if(state.selectedShopId===shopId)state.selectedShopId=state.shops.find(item=>!item.archived)?.id||"";
  if(state.reportShopId===shopId)state.reportShopId="__all_shops__";
  try{saveData()}catch(storageError){shop.archived=false;console.error("Could not archive the shop.",storageError);alert("The shop could not be archived in this browser.");return}
  renderShopSelector();
  renderAdminDashboard();
  showToast("Shop archived");
}
function restoreShop(shopId){
  const shop=state.shops.find(item=>item.id===shopId&&item.archived);
  if(!shop)return;
  shop.archived=false;
  try{saveData()}catch(storageError){shop.archived=true;console.error("Could not restore the shop.",storageError);alert("The shop could not be restored in this browser.");return}
  renderShopSelector();
  renderAdminDashboard();
  showToast("Shop restored");
}
const dailyReportInputIds=["dailySalesTarget","monthlySalesTarget","dailySalesExpenses","dailySalesReturns","dailyVoidedLines","financialVatRate","dailyPreparedBy","dailyReviewedBy","dailySalesNotes"];
function dailyReportDetailsKey(){
  return `${state.reportShopId}|${$("financialReportDate").value||dateKey(new Date())}`;
}
function loadDailyReportDetails(){
  const details=dailyReportDetails[dailyReportDetailsKey()]||{};
  dailyReportInputIds.forEach(id=>{
    const input=$(id);
    if(input)input.value=details[id]??(id==="financialVatRate"?"12":id==="dailySalesTarget"||id==="monthlySalesTarget"||id==="dailySalesExpenses"||id==="dailySalesReturns"||id==="dailyVoidedLines"?"0":"");
  });
}
function saveDailyReportDetails(){
  dailyReportDetails[dailyReportDetailsKey()]=Object.fromEntries(dailyReportInputIds.map(id=>[id,$(id).value]));
  try{
    localStorage.setItem(DAILY_REPORT_DETAILS_KEY,JSON.stringify(dailyReportDetails));
    dailyReportStorageError=false;
  }catch(storageError){
    console.error("Could not save daily report details.",storageError);
    dailyReportStorageError=true;
  }
}
function renderDailySalesReport(reportShops){
  if(!$("dailyReportSalesSummary"))return;
  const reportDate=$("financialReportDate").value||dateKey(new Date());
  const reportSales=reportShops.flatMap(shop=>shop.sales
    .filter(sale=>dateKey(new Date(sale.date))===reportDate)
    .map(sale=>({shop,sale})));
  const allSales=reportShops.flatMap(shop=>shop.sales.map(sale=>({shop,sale})));
  const dayStart=reportDate;
  const [year,month]=reportDate.split("-").map(Number);
  const monthStart=`${year}-${String(month).padStart(2,"0")}-01`;
  const mtdSales=allSales.filter(({sale})=>{
    const key=dateKey(new Date(sale.date));
    return key>=monthStart&&key<=dayStart;
  });
  const details=dailyReportDetails[dailyReportDetailsKey()]||{};
  const numeric=(key,fallback=0)=>{
    const value=Number(details[key]??$(key)?.value??fallback);
    return Number.isFinite(value)&&value>=0?value:fallback;
  };
  const gross=reportSales.reduce((sum,{sale})=>sum+(Number(sale.subtotal)||Number(sale.total)||0),0);
  const discounts=reportSales.reduce((sum,{sale})=>sum+(Number(sale.discount)||0),0);
  const returns=numeric("dailySalesReturns");
  const netSales=gross-discounts-returns;
  const units=reportSales.reduce((sum,{sale})=>sum+sale.items.reduce((itemSum,item)=>itemSum+(Number(item.qty)||0),0),0);
  const receiptCount=reportSales.length;
  const averageSale=receiptCount?netSales/receiptCount:0;
  const dailyTarget=numeric("dailySalesTarget");
  const monthlyTarget=numeric("monthlySalesTarget");
  const mtdNet=mtdSales.reduce((sum,{sale})=>sum+(Number(sale.total)||0),0)-returns;
  const expenses=numeric("dailySalesExpenses");
  const vatRate=Math.min(100,numeric("financialVatRate",12));
  const vatIncluded=netSales*vatRate/(100+vatRate);
  const costKnown=returns===0&&reportSales.every(({sale})=>sale.items.every(item=>item.costPrice!==null&&item.costPrice!==undefined&&Number.isFinite(Number(item.costPrice))));
  const costOfGoods=costKnown?reportSales.reduce((sum,{sale})=>sum+sale.items.reduce((itemSum,item)=>itemSum+(Number(item.costPrice)||0)*(Number(item.qty)||0),0),0):null;
  const grossProfit=costOfGoods===null?null:netSales-costOfGoods;
  const previousDate=new Date(`${reportDate}T00:00:00`);
  previousDate.setDate(previousDate.getDate()-7);
  const previousDateKey=dateKey(previousDate);
  const previousSales=allSales.filter(({sale})=>dateKey(new Date(sale.date))===previousDateKey);
  const previousNet=previousSales.reduce((sum,{sale})=>sum+(Number(sale.total)||0),0);
  const changeVsPrevious=previousNet?`${((netSales-previousNet)/previousNet*100).toFixed(1)}%`:netSales>0?"New sales":"—";
  const achieved=dailyTarget>0?`${(netSales/dailyTarget*100).toFixed(1)}%`:"—";
  const pace=monthlyTarget>0?`${(mtdNet/monthlyTarget*100).toFixed(1)}%`:"—";
  const rows=(entries)=>entries.map(([label,value])=>`<tr><td>${escapeHtml(label)}</td><td>${value}</td></tr>`).join("");
  const shopsCaption=state.reportShopId==="__all_shops__"?reportShops.map(shop=>shop.name).join(" · "):reportShops[0]?.name||"No active shops selected";
  $("dailyReportShopName").textContent=state.reportShopId==="__all_shops__"?"All registered shops":reportShops[0]?.name||"Shop";
  $("dailyReportShopInfo").textContent=shopsCaption;
  $("dailyReportDateCaption").textContent=new Date(`${reportDate}T00:00:00`).toLocaleDateString("en-PH",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  $("dailyReportSalesSummary").innerHTML=rows([
    ["Gross sales",peso.format(gross)],
    ["Less: discounts",peso.format(discounts)],
    ["Less: returns",peso.format(returns)],
    ["Net sales",`<strong>${peso.format(netSales)}</strong>`],
    [`VAT included (${vatRate}%)`,peso.format(vatIncluded)],
    ["Net sales excluding tax",peso.format(netSales-vatIncluded)],
    ["Cost of goods sold",costOfGoods===null?"Not recorded":peso.format(costOfGoods)],
    ["Gross profit",grossProfit===null?"Not recorded":`<strong>${peso.format(grossProfit)}</strong>`],
    ["Gross margin",grossProfit===null||netSales===0?"—":`${(grossProfit/netSales*100).toFixed(1)}%`]
  ]);
  $("dailyReportTransactions").innerHTML=rows([
    ["Transactions (receipts)",receiptCount],
    ["Units sold",units],
    ["Average transaction value",peso.format(averageSale)],
    ["Units per transaction",receiptCount?(units/receiptCount).toFixed(2):"0.00"],
    ["Returns | voided lines",`${peso.format(returns)} | ${numeric("dailyVoidedLines")}`],
    ["Daily target",dailyTarget?peso.format(dailyTarget):"—"],
    ["Target achieved",achieved],
    ["Same day last week",previousSales.length?peso.format(previousNet):"—"],
    ["Change vs last week",changeVsPrevious]
  ]);
  $("dailyReportMonthToDate").innerHTML=rows([
    ["Month to date: net sales",peso.format(mtdNet)],
    ["Month to date: target",monthlyTarget?peso.format(monthlyTarget):"—"]
  ]);
  const inStore=netSales;
  $("dailyReportPaceChannel").innerHTML=rows([
    ["Pace (MTD sales / MTD target)",pace],
    ["Channel: in-store",`${peso.format(inStore)} · ${receiptCount} receipts`],
    ["Channel: online","Not tracked"]
  ]);
  const categoryTotals=new Map();
  const paymentTotals=new Map();
  const productTotals=new Map();
  reportSales.forEach(({shop,sale})=>{
    const subtotal=Number(sale.subtotal)||0;
    const netFactor=subtotal>0?Math.max(0,(subtotal-(Number(sale.discount)||0))/subtotal):1;
    if(sale.paymentMethod){
      const payment=paymentTotals.get(sale.paymentMethod)||{receipts:0,net:0};
      payment.receipts++;
      payment.net+=Number(sale.total)||0;
      paymentTotals.set(sale.paymentMethod,payment);
    }
    sale.items.forEach(item=>{
      const itemNet=(Number(item.lineTotal)||0)*netFactor;
      const category=item.category||shop.products.find(product=>product.id===item.productId)?.category||"Uncategorized";
      const categoryTotal=categoryTotals.get(category)||{units:0,net:0};
      categoryTotal.units+=Number(item.qty)||0;
      categoryTotal.net+=itemNet;
      categoryTotals.set(category,categoryTotal);
      const baseBarcode=item.barcode||shop.products.find(product=>product.id===item.productId)?.barcode||"—";
      const productKey=`${item.name}|${baseBarcode}`;
      const productTotal=productTotals.get(productKey)||{name:item.name,barcode:baseBarcode,units:0,net:0,barcodes:[]};
      productTotal.units+=Number(item.qty)||0;
      productTotal.net+=itemNet;
      productTotal.barcodes.push(...getItemSoldBarcodes(item,item.categoryBarcodePrefix||shop.products.find(product=>product.id===item.productId)?.categoryBarcodePrefix||baseBarcode));
      productTotals.set(productKey,productTotal);
    });
  });
  const soldNet=[...categoryTotals.values()].reduce((sum,total)=>sum+total.net,0);
  const returnFactor=soldNet>0?netSales/soldNet:1;
  categoryTotals.forEach(total=>{total.net*=returnFactor});
  paymentTotals.forEach(total=>{total.net*=returnFactor});
  productTotals.forEach(total=>{total.net*=returnFactor});
  const categoryRows=[...categoryTotals.entries()].sort((a,b)=>b[1].net-a[1].net);
  $("dailyReportCategories").innerHTML=categoryRows.length?categoryRows.map(([name,total])=>`<tr><td>${escapeHtml(name)}</td><td>${total.units}</td><td>${peso.format(total.net)}</td><td>${netSales?`${(total.net/netSales*100).toFixed(1)}%`:"—"}</td></tr>`).join("")+`<tr class="daily-report-total"><th>Total</th><th>${units}</th><th>${peso.format(categoryRows.reduce((sum,[,total])=>sum+total.net,0))}</th><th>${netSales?`${(categoryRows.reduce((sum,[,total])=>sum+total.net,0)/netSales*100).toFixed(1)}%`:"—"}</th></tr>`:`<tr><td colspan="4">No sales recorded</td></tr>`;
  const paymentRows=[...paymentTotals.entries()].sort((a,b)=>b[1].net-a[1].net);
  $("dailyReportPayments").innerHTML=paymentRows.length?paymentRows.map(([name,total])=>`<tr><td>${escapeHtml(name)}</td><td>${total.receipts}</td><td>${peso.format(total.net)}</td><td>${netSales?`${(total.net/netSales*100).toFixed(1)}%`:"—"}</td></tr>`).join("")+`<tr class="daily-report-total"><th>Total</th><th>${receiptCount}</th><th>${peso.format(paymentRows.reduce((sum,[,total])=>sum+total.net,0))}</th><th>${netSales?`${(paymentRows.reduce((sum,[,total])=>sum+total.net,0)/netSales*100).toFixed(1)}%`:"—"}</th></tr>`:`<tr><td colspan="4">No sales recorded</td></tr>`;
  $("dailyReportStaff").innerHTML=receiptCount?`<tr><td>Shop staff (not recorded individually)</td><td>${receiptCount}</td><td>${peso.format(netSales)}</td><td>${peso.format(averageSale)}</td></tr>`:`<tr><td colspan="4">No sales recorded</td></tr>`;
  const topProducts=[...productTotals.values()].sort((a,b)=>b.units-a.units||b.net-a.net).slice(0,5);
  $("dailyReportProducts").innerHTML=topProducts.length?topProducts.map(product=>`<tr><td>${escapeHtml(product.name)}<small class="daily-report-sku">${product.barcodes.map(escapeHtml).join(", ")}</small></td><td>${product.units}</td><td>${peso.format(product.net)}</td></tr>`).join(""):`<tr><td colspan="3">No sales recorded</td></tr>`;
  $("dailyReportExpenses").innerHTML=rows([
    ["Gross profit",grossProfit===null?"Not recorded":`<strong>${peso.format(grossProfit)}</strong>`],
    ["Less: expenses paid today",peso.format(expenses)],
    ["Net for the day",grossProfit===null?"Not recorded":`<strong>${peso.format(grossProfit-expenses)}</strong>`]
  ]);
  $("dailyReportNotes").textContent=details.dailySalesNotes||"Notes: None.";
  $("dailyReportPreparedBy").textContent=details.dailyPreparedBy||"—";
  $("dailyReportReviewedBy").textContent=details.dailyReviewedBy||"—";
  $("dailyReportNotes").classList.toggle("empty-notes",!details.dailySalesNotes);
  $("dailyReportInputMessage").textContent=dailyReportStorageError
    ?"Report inputs could not be saved in this browser."
    :returns>0?"Returned-item costs are not tracked; gross profit is not calculated."
    :costKnown||!reportSales.length?"":"Add unit costs to products to calculate cost of goods sold and gross profit.";
}
function renderQuarterlySalesReport(reportShops,reportYear,quarter,quarterStartMonth,quarterStart,quarterEnd){
  const sales=reportShops.flatMap(shop=>shop.sales
    .filter(sale=>{
      const month=dateKey(new Date(sale.date)).slice(0,7);
      return month>=quarterStart&&month<=quarterEnd;
    })
    .map(sale=>({shop,sale})));
  const quarterGross=sales.reduce((sum,{sale})=>sum+(Number(sale.subtotal)||Number(sale.total)||0),0);
  const quarterDiscounts=sales.reduce((sum,{sale})=>sum+(Number(sale.discount)||0),0);
  const quarterNet=sales.reduce((sum,{sale})=>sum+(Number(sale.total)||0),0);
  const monthly=Array.from({length:3},(_,index)=>{
    const monthIndex=quarterStartMonth+index;
    const monthKey=`${reportYear}-${String(monthIndex+1).padStart(2,"0")}`;
    const monthSales=sales.filter(({sale})=>dateKey(new Date(sale.date)).slice(0,7)===monthKey);
    const gross=monthSales.reduce((sum,{sale})=>sum+(Number(sale.subtotal)||Number(sale.total)||0),0);
    const net=monthSales.reduce((sum,{sale})=>sum+(Number(sale.total)||0),0);
    return {month:new Date(reportYear,monthIndex,1).toLocaleDateString("en-PH",{month:"long",year:"numeric"}),gross,net,royalty:Math.round((gross*ROYALTY_RATE/100+Number.EPSILON)*100)/100};
  });
  const categoryTotals=new Map();
  const paymentTotals=new Map();
  sales.forEach(({shop,sale})=>{
    const subtotal=Number(sale.subtotal)||0;
    const netFactor=subtotal>0?(Number(sale.total)||0)/subtotal:1;
    const payment=sale.paymentMethod||"Unspecified";
    const paymentTotal=paymentTotals.get(payment)||{receipts:0,net:0};
    paymentTotal.receipts++;
    paymentTotal.net+=Number(sale.total)||0;
    paymentTotals.set(payment,paymentTotal);
    sale.items.forEach(item=>{
      const category=item.category||shop.products.find(product=>product.id===item.productId)?.category||"Uncategorized";
      const total=categoryTotals.get(category)||{units:0,net:0};
      total.units+=Number(item.qty)||0;
      total.net+=(Number(item.lineTotal)||0)*netFactor;
      categoryTotals.set(category,total);
    });
  });
  const royalty=monthly.reduce((sum,row)=>sum+row.royalty,0);
  const startLabel=new Date(reportYear,quarterStartMonth,1).toLocaleDateString("en-PH",{month:"short"});
  const endLabel=new Date(reportYear,quarterStartMonth+2,1).toLocaleDateString("en-PH",{month:"short"});
  const quarterLabel=`Q${quarter} ${reportYear} · ${startLabel} – ${endLabel}`;
  $("quarterlyReportShopName").textContent=state.reportShopId==="__all_shops__"?"All registered shops":reportShops[0]?.name||"Shop";
  $("quarterlyReportShopInfo").textContent=state.reportShopId==="__all_shops__"?reportShops.map(shop=>shop.name).join(" · ")||"No active shops":reportShops[0]?.name||"No active shop";
  $("quarterlyReportCaption").textContent=quarterLabel;
  $("quarterlyCaption").textContent=quarterLabel;
  $("quarterlyMtdReport").innerHTML=monthly.map(row=>`<tr><td>${escapeHtml(row.month)}</td><td>${peso.format(row.gross)}</td><td>${peso.format(row.net)}</td><td>${peso.format(row.royalty)}</td></tr>`).join("")+`<tr class="daily-report-total"><th>Quarter total</th><th>${peso.format(quarterGross)}</th><th>${peso.format(quarterNet)}</th><th>${peso.format(royalty)}</th></tr>`;
  $("quarterlyGrossReport").innerHTML=[
    ["Reporting period",quarterLabel],
    ["Gross sales · 3 months",`<strong>${peso.format(quarterGross)}</strong>`],
    ["Less: discounts",peso.format(quarterDiscounts)],
    ["Net sales",`<strong>${peso.format(quarterNet)}</strong>`],
    ["Royalty rate",`${ROYALTY_RATE}%`],
    ["Total royalty due",`<strong>${peso.format(royalty)}</strong>`],
    ["Transactions",sales.length.toLocaleString("en-PH")]
  ].map(([label,value])=>`<tr><td>${escapeHtml(label)}</td><td>${value}</td></tr>`).join("");
  const categories=[...categoryTotals.entries()].sort((a,b)=>b[1].net-a[1].net);
  $("quarterlyCategoryReport").innerHTML=categories.length?categories.map(([name,total])=>`<tr><td>${escapeHtml(name)}</td><td>${total.units}</td><td>${peso.format(total.net)}</td><td>${quarterNet?`${(total.net/quarterNet*100).toFixed(1)}%`:"—"}</td></tr>`).join("")+`<tr class="daily-report-total"><th>Total</th><th>${sales.reduce((sum,{sale})=>sum+sale.items.reduce((subtotal,item)=>subtotal+(Number(item.qty)||0),0),0)}</th><th>${peso.format(quarterNet)}</th><th>${quarterNet?"100.0%":"—"}</th></tr>`:`<tr><td colspan="4">No sales recorded</td></tr>`;
  const payments=[...paymentTotals.entries()].sort((a,b)=>b[1].net-a[1].net);
  $("quarterlyPaymentReport").innerHTML=payments.length?payments.map(([name,total])=>`<tr><td>${escapeHtml(name)}</td><td>${total.receipts}</td><td>${peso.format(total.net)}</td><td>${quarterNet?`${(total.net/quarterNet*100).toFixed(1)}%`:"—"}</td></tr>`).join("")+`<tr class="daily-report-total"><th>Total</th><th>${sales.length}</th><th>${peso.format(quarterNet)}</th><th>${quarterNet?"100.0%":"—"}</th></tr>`:`<tr><td colspan="4">No sales recorded</td></tr>`;
  const now=new Date();
  const currentMonthIsSelected=reportYear===now.getFullYear()&&Math.floor(now.getMonth()/3)+1===quarter;
  const mtdNet=currentMonthIsSelected?sales.reduce((sum,{sale})=>{
    const saleDate=new Date(sale.date);
    return saleDate.getMonth()===now.getMonth()&&saleDate.getDate()<=now.getDate()
      ?sum+(Number(sale.total)||0):sum;
  },0):0;
  $("quarterlyReportSummary").innerHTML=`<div><span>Gross sales · 3 months</span><strong>${peso.format(quarterGross)}</strong></div><div><span>Month-to-date net sales</span><strong>${peso.format(mtdNet)}</strong></div><div><span>Royalty · ${ROYALTY_RATE}% of gross</span><strong>${peso.format(royalty)}</strong></div><div><span>Transactions</span><strong>${sales.length}</strong></div>`;
  $("quarterGrossSales").textContent=peso.format(quarterGross);
  $("quarterTransactions").textContent=sales.length.toLocaleString("en-PH");
}
function renderReportsOverview(){
  if(!$("dailySalesReport"))return;
  const reportShops=getReportShops();
  renderDailySalesReport(reportShops);
  const today=dateKey(new Date());
  const reportFrom=$("rgoReportFrom").value||today;
  const reportTo=$("rgoReportTo").value||reportFrom;
  const validRange=reportFrom<=reportTo;
  const inRange=saleDate=>validRange&&saleDate>=reportFrom&&saleDate<=reportTo;
  const reportYear=Number($("financialReportYear").value)||new Date().getFullYear();
  const quarter=Number($("financialReportQuarter").value)||1;
  const quarterStartMonth=(quarter-1)*3;
  const quarterStart=`${reportYear}-${String(quarterStartMonth+1).padStart(2,"0")}`;
  const quarterEnd=`${reportYear}-${String(quarterStartMonth+3).padStart(2,"0")}`;
  const dailyRows=reportShops.map(shop=>{
    const sales=shop.sales.filter(sale=>inRange(dateKey(new Date(sale.date))));
    return {shop,sales,gross:sales.reduce((sum,sale)=>sum+(Number(sale.subtotal)||Number(sale.total)||0),0),discounts:sales.reduce((sum,sale)=>sum+(Number(sale.discount)||0),0),net:sales.reduce((sum,sale)=>sum+(Number(sale.total)||0),0)};
  });
  const monthlyRows=reportShops.map(shop=>{
    const sales=shop.sales.filter(sale=>{
      const month=dateKey(new Date(sale.date)).slice(0,7);
      return month>=quarterStart&&month<=quarterEnd;
    });
    return {shop,sales,gross:sales.reduce((sum,sale)=>sum+(Number(sale.subtotal)||Number(sale.total)||0),0),discounts:sales.reduce((sum,sale)=>sum+(Number(sale.discount)||0),0),net:sales.reduce((sum,sale)=>sum+(Number(sale.total)||0),0)};
  });
  const receipts=dailyRows.flatMap(row=>row.sales.map(sale=>({shop:row.shop,sale})));
  const inventory=reportShops.flatMap(shop=>shop.products.map(product=>({shop,product})));
  const soldByShop=new Map(dailyRows.map(({shop,sales})=>{
    const soldByProduct=new Map();
    sales.forEach(sale=>sale.items.forEach(item=>{
      const productKey=item.productId||item.name;
      soldByProduct.set(productKey,(soldByProduct.get(productKey)||0)+(Number(item.qty)||0));
    }));
    return [shop.id,soldByProduct];
  }));
  const totalUnits=inventory.reduce((sum,row)=>sum+(Number(row.product.actualStock)||0),0);
  const inventoryValue=inventory.reduce((sum,row)=>sum+(Number(row.product.actualStock)||0)*(Number(row.product.price)||0),0);
  const totals=dailyRows.reduce((summary,row)=>({
    count:summary.count+row.sales.length,
    gross:summary.gross+row.gross,
    discounts:summary.discounts+row.discounts,
    net:summary.net+row.net
  }),{count:0,gross:0,discounts:0,net:0});
  $("reportShopCount").textContent=reportShops.length;
  $("reportSaleCount").textContent=totals.count;
  $("reportSaleDateCaption").textContent=validRange
    ?`${new Date(`${reportFrom}T00:00:00`).toLocaleDateString("en-PH",{dateStyle:"medium"})} – ${new Date(`${reportTo}T00:00:00`).toLocaleDateString("en-PH",{dateStyle:"medium"})}`
    :"Invalid date range";
  $("reportNetSales").textContent=peso.format(totals.net);
  $("reportInventoryUnits").textContent=totalUnits.toLocaleString("en-PH");
  $("reportInventoryValue").textContent=`${peso.format(inventoryValue)} inventory value`;
  $("dailySalesReport").innerHTML=dailyRows.length
    ?dailyRows.map(row=>`<tr><td>${escapeHtml(row.shop.name)}</td><td>${row.sales.length}</td><td>${peso.format(row.gross)}</td><td>${peso.format(row.discounts)}</td><td>${peso.format(row.net)}</td></tr>`).join("")
    :`<tr><td colspan="5">No registered shops.</td></tr>`;
  const soldRows=dailyRows.flatMap(({shop,sales})=>sales.flatMap(sale=>sale.items.flatMap(item=>{
    const product=shop.products.find(entry=>entry.id===item.productId);
    const baseBarcode=item.categoryBarcodePrefix||product?.categoryBarcodePrefix||item.barcode||product?.barcode;
    const soldBarcodes=getItemSoldBarcodes(item,baseBarcode);
    const units=Math.max(1,Number(item.qty)||1);
    return Array.from({length:units},(_,index)=>({shop,sale,item,barcode:soldBarcodes[index]||baseBarcode||"—"}));
  })));
  $("dailySalesBarcodes").innerHTML=soldRows.length
    ?soldRows.map(({shop,sale,item,barcode})=>`<tr><td>${new Date(sale.date).toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"})}</td><td>${escapeHtml(shop.name)}</td><td>${escapeHtml(sale.id)}</td><td><code class="barcode-cell">${escapeHtml(barcode)}</code></td><td>${escapeHtml(item.name)}</td><td>1</td><td>${peso.format((Number(item.lineTotal)||0)/Math.max(1,Number(item.qty)||1))}</td></tr>`).join("")
    :`<tr><td colspan="7">No products sold in this date range.</td></tr>`;
  $("shopFinancialReport").innerHTML=monthlyRows.length
    ?monthlyRows.map(row=>`<tr><td>${escapeHtml(row.shop.name)}</td><td>${peso.format(row.gross)}</td><td>${peso.format(row.discounts)}</td><td>${peso.format(row.net)}</td><td>${row.sales.length}</td></tr>`).join("")
    :`<tr><td colspan="5">No registered shops.</td></tr>`;
  const quarterSales=reportShops.flatMap(shop=>shop.sales.filter(sale=>{
    const saleMonth=dateKey(new Date(sale.date)).slice(0,7);
    return saleMonth>=quarterStart&&saleMonth<=quarterEnd;
  }));
  const quarterGross=quarterSales.reduce((sum,sale)=>sum+(Number(sale.subtotal)||Number(sale.total)||0),0);
  const bestSellers=new Map();
  quarterSales.forEach(sale=>sale.items.forEach(item=>bestSellers.set(item.name,(bestSellers.get(item.name)||0)+(Number(item.qty)||0))));
  const bestSeller=[...bestSellers.entries()].sort((a,b)=>b[1]-a[1])[0];
  const royaltyRate=ROYALTY_RATE;
  const monthlyStatement=Array.from({length:3},(_,index)=>{
    const monthIndex=quarterStartMonth+index;
    const monthKey=`${reportYear}-${String(monthIndex+1).padStart(2,"0")}`;
    const sales=quarterSales.filter(sale=>dateKey(new Date(sale.date)).slice(0,7)===monthKey);
    const gross=sales.reduce((sum,sale)=>sum+(Number(sale.subtotal)||Number(sale.total)||0),0);
    const discounts=sales.reduce((sum,sale)=>sum+(Number(sale.discount)||0),0);
    const net=sales.reduce((sum,sale)=>sum+(Number(sale.total)||0),0);
    return {month:new Date(reportYear,monthIndex,1).toLocaleDateString("en-PH",{month:"long",year:"numeric"}),gross,discounts,net,royalty:Math.round((gross*royaltyRate/100+Number.EPSILON)*100)/100};
  });
  const totalRoyalty=monthlyStatement.reduce((sum,row)=>sum+row.royalty,0);
  const monthlyGross=monthlyStatement.reduce((sum,row)=>sum+row.gross,0);
  $("royaltySummary").innerHTML=`<div><span>Quarter gross sales</span><strong>${peso.format(monthlyGross)}</strong></div><div><span>Royalty rate</span><strong>${royaltyRate}%</strong></div><div><span>Total royalty · ${quarter}${quarter===1?"st":quarter===2?"nd":quarter===3?"rd":"th"} quarter</span><strong>${peso.format(totalRoyalty)}</strong></div><div><span>Net after royalty</span><strong>${peso.format(monthlyStatement.reduce((sum,row)=>sum+row.net,0)-totalRoyalty)}</strong></div>`;
  const monthTotals=monthlyStatement.reduce((total,row)=>({gross:total.gross+row.gross,discounts:total.discounts+row.discounts,net:total.net+row.net}),{gross:0,discounts:0,net:0});
  $("quarterlyFinancialReport").innerHTML=monthlyStatement.map(row=>`<tr><td>${escapeHtml(row.month)}</td><td>${peso.format(row.gross)}</td><td>${peso.format(row.discounts)}</td><td>${peso.format(row.net)}</td><td>${royaltyRate}%</td><td>${peso.format(row.royalty)}</td></tr>`).join("")+`<tr class="statement-total-row"><th>Total · Q${quarter} ${reportYear}</th><th>${peso.format(monthTotals.gross)}</th><th>${peso.format(monthTotals.discounts)}</th><th>${peso.format(monthTotals.net)}</th><th>${royaltyRate}%</th><th>${peso.format(totalRoyalty)}</th></tr>`;
  const quarterLabel=`Q${quarter} ${reportYear} · ${new Date(reportYear,quarterStartMonth,1).toLocaleDateString("en-PH",{month:"short"})} – ${new Date(reportYear,quarterStartMonth+2,1).toLocaleDateString("en-PH",{month:"short"})}`;
  $("quarterlyCaption").textContent=quarterLabel;
  renderQuarterlySalesReport(reportShops,reportYear,quarter,quarterStartMonth,quarterStart,quarterEnd);
  $("quarterGrossSales").textContent=peso.format(quarterGross);
  $("quarterTransactions").textContent=quarterSales.length.toLocaleString("en-PH");
  $("quarterBestSeller").textContent=bestSeller?`${bestSeller[0]} · ${bestSeller[1]} sold`:"—";
  $("shopInventoryReport").innerHTML=inventory.length
    ?inventory.map(({shop,product})=>{
      const stock=Number(product.stock)||0;
      const actualStock=Number(product.actualStock)||0;
      const unaccounted=actualStock!==stock;
      const status=unaccounted?"Unaccounted":stock===0?"Sold":"In stock";
      const lastUpdated=product.updatedAt?new Date(product.updatedAt).toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"}):"—";
      return `<tr class="${unaccounted?"unaccounted-row":""}"><td>${escapeHtml(shop.name)}</td><td>PRD-${escapeHtml(product.id.slice(-6).toUpperCase())}</td><td><code class="barcode-cell">${escapeHtml(product.barcode||"—")}</code></td><td>${escapeHtml(product.name)}</td><td>${escapeHtml(product.category)}</td><td>${stock}</td><td>${actualStock}</td><td><span class="inventory-status ${unaccounted?"unaccounted":stock===0?"out":"in"}">${unaccounted?"⚠ RGO · ":""}${status}</span></td><td>${lastUpdated}</td><td>${soldByShop.get(shop.id)?.get(product.id)||soldByShop.get(shop.id)?.get(product.name)||0}</td><td>${peso.format(Number(product.price)||0)}</td><td>${peso.format(stock*(Number(product.price)||0))}</td></tr>`;
    }).join("")
    :`<tr><td colspan="12">No inventory records for these shops.</td></tr>`;
  $("supportingDocumentsReport").innerHTML=receipts.length
    ?receipts.map(({shop,sale})=>`<tr><td>${escapeHtml(shop.name)}</td><td>${escapeHtml(sale.id)}</td><td>${new Date(sale.date).toLocaleString("en-PH")}</td><td>${escapeHtml(sale.paymentMethod||"")}</td><td>${peso.format(Number(sale.total)||0)}</td><td><button class="small-btn" data-report-receipt="${escapeHtml(shop.id)}|${escapeHtml(sale.id)}">View receipt</button></td></tr>`).join("")
    :`<tr><td colspan="6">No supporting receipts for this date.</td></tr>`;
  document.querySelectorAll("[data-report-receipt]").forEach(button=>button.onclick=()=>{
    const [shopId,saleId]=button.dataset.reportReceipt.split("|");
    const sale=state.shops.find(shop=>shop.id===shopId)?.sales.find(record=>record.id===saleId);
    if(sale)showReceipt(sale);
  });
  renderPaymentReminders();
}
function refreshFromStoredShops(serializedShops){
  try{
    const savedShops=JSON.parse(serializedShops);
    if(!Array.isArray(savedShops))throw new Error("Stored shop data is not an array.");
    state.shops.splice(0,state.shops.length,...savedShops.map(shop=>({
      ...shop,
      products:Array.isArray(shop.products)?shop.products:[],
      sales:Array.isArray(shop.sales)?shop.sales:[]
    })));
  }catch(storageError){
    console.error("Could not refresh shop data from another tab.",storageError);
    return;
  }
  if(!state.shops.some(shop=>shop.id===state.selectedShopId&&!shop.archived))state.selectedShopId=state.shops.find(shop=>!shop.archived)?.id||"";
  if(state.reportShopId!=="__all_shops__"&&!state.shops.some(shop=>shop.id===state.reportShopId&&!shop.archived))state.reportShopId="__all_shops__";
  renderShopSelector();
  renderSales();
  renderAdminDashboard();
  renderDocuments("admin");
  renderDocuments("staff");
  if(state.role==="souvenir"){
    renderCategories();
    renderProducts();
    renderInventory();
    renderCart();
  }else if(state.role==="rgo"&&!$("notificationModal").classList.contains("hidden")){
    renderNotifications();
  }
}
function downloadReportCsv(tableBodyId,reportName){
  let rows;
  if(tableBodyId==="quarterlyFinancialReport"){
    const sheet=$("quarterlySalesReportSheet");
    rows=[["Quarterly sales report"],[$("quarterlyReportShopName").textContent],[$("quarterlyReportCaption").textContent],[]];
    Array.from($("quarterlyReportSummary").children).forEach(card=>rows.push([card.querySelector("span")?.textContent||"",card.querySelector("strong")?.textContent||""]));
    sheet.querySelectorAll(".daily-report-section").forEach(section=>{
      rows.push([], [section.querySelector("h3").textContent]);
      Array.from(section.querySelector("table").rows).forEach(row=>rows.push(Array.from(row.cells,cell=>cell.textContent.trim())));
    });
  }else{
    const table=$(tableBodyId).closest("table");
    rows=Array.from(table.rows,row=>Array.from(row.cells,cell=>cell.textContent.trim()));
  }
  const csv=rows.map(row=>row.map(value=>{
    const safeValue=/^[\t\r ]*[=+\-@]/.test(value)?`'${value}`:value;
    return `"${safeValue.replaceAll('"','""')}"`;
  }).join(",")).join("\r\n");
  const reportDate=tableBodyId==="quarterlyFinancialReport"
    ?`${$("financialReportYear").value}-Q${$("financialReportQuarter").value}`
    :`${$("rgoReportFrom").value||dateKey(new Date())}_to_${$("rgoReportTo").value||dateKey(new Date())}`;
  const selectedShop=state.shops.find(shop=>shop.id===state.reportShopId);
  const shopName=(selectedShop?.name||"all-shops").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"shop";
  const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=`${reportName}-${shopName}-${reportDate}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function addShop(event){
  event.preventDefault();
  const name=$("newShopName").value.trim();
  const error=$("addShopError");
  error.textContent="";
  error.classList.add("hidden");
  if(!name){
    error.textContent="Enter a shop name.";
    error.classList.remove("hidden");
    return;
  }
  if(state.shops.some(shop=>shop.name.toLocaleLowerCase()===name.toLocaleLowerCase())){
    error.textContent="A shop with that name already exists.";
    error.classList.remove("hidden");
    return;
  }
  const shop={id:crypto.randomUUID(),name,products:[],sales:[]};
  state.shops.push(shop);
  const previousShopId=state.selectedShopId;
  state.selectedShopId=shop.id;
  try{
    saveData();
  }catch(storageError){
    state.shops.pop();
    state.selectedShopId=previousShopId;
    error.textContent="The shop could not be saved in this browser. Check browser storage and try again.";
    error.classList.remove("hidden");
    return;
  }
  closeModal("addShopModal");
  state.reportShopId=shop.id;
  renderShopSelector();
  renderCategories();
  renderProducts();
  renderCart();
  renderInventory();
  renderSales();
  renderReportsOverview();
}
function clearAuthError(){
  $("authError").textContent="";
  $("authError").classList.add("hidden");
}
function setAuthMode(mode){
  authMode=mode;
  selectedAuthRole=null;
  $("roleSelection").classList.remove("hidden");
  $("credentialsForm").classList.add("hidden");
  $("loginTitle").textContent=mode==="signup"?"Create your account":"Welcome back";
  $("loginIntro").textContent=mode==="signup"?"Choose your account type to get started.":"Choose your account type to log in.";
  document.querySelectorAll("[data-auth-mode]").forEach(button=>{
    const active=button.dataset.authMode===mode;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  clearAuthError();
}
function selectAuthRole(role){
  selectedAuthRole=role;
  const isShopOwner=role==="souvenir";
  $("roleSelection").classList.add("hidden");
  $("credentialsForm").classList.remove("hidden");
  $("selectedRole").textContent=isShopOwner?"🛍️  Shop Owner":"📊  RGO";
  $("authPassword").autocomplete=authMode==="signup"?"new-password":"current-password";
  $("confirmPasswordField").classList.toggle("hidden",authMode!=="signup");
  $("confirmPassword").required=authMode==="signup";
  $("authSubmit").innerHTML=authMode==="signup"?"Create account <span aria-hidden=\"true\">→</span>":`Log in as ${isShopOwner?"Shop Owner":"RGO"} <span aria-hidden="true">→</span>`;
  $("demoCredentials").classList.toggle("hidden",authMode==="signup");
  $("demoCredentials").textContent=isShopOwner?"Demo: shopowner / owner123":"Demo: admin / admin123";
  $("authUsername").value="";
  $("authPassword").value="";
  $("confirmPassword").value="";
  clearAuthError();
  $("authUsername").focus();
}
function submitCredentials(event){
  event.preventDefault();
  const username=$("authUsername").value.trim().toLowerCase();
  const password=$("authPassword").value;
  const error=$("authError");
  const showError=message=>{error.textContent=message;error.classList.remove("hidden")};
  if(!selectedAuthRole)return;
  if(authMode==="signup"){
    if(username.length<3){showError("Choose a username with at least 3 characters.");return}
    if(password.length<6){showError("Choose a password with at least 6 characters.");return}
    if(password!==$("confirmPassword").value){showError("Your passwords do not match.");return}
    if(accounts.some(account=>account.role===selectedAuthRole&&account.username===username)){
      showError("That username is already registered for this account type.");
      return;
    }
    accounts.push({role:selectedAuthRole,username,password});
    try{
      localStorage.setItem(ACCOUNTS_STORAGE_KEY,JSON.stringify(accounts));
    }catch(storageError){
      accounts.pop();
      showError("Your account could not be saved in this browser. Check browser storage and try again.");
      return;
    }
  }else if(!accounts.some(account=>account.role===selectedAuthRole&&account.username===username&&account.password===password)){
    showError("Incorrect username or password. Please try again.");
    $("authPassword").value="";
    $("authPassword").focus();
    return;
  }
  const role=selectedAuthRole;
  $("authUsername").value="";
  $("authPassword").value="";
  $("confirmPassword").value="";
  applyRole(role);
}
function updateLoginTabs(){
  const isSignup=authMode==="signup",isShop=selectedAuthRole==="souvenir";
  const roleName=isShop?"Shop":"Admin";
  $("authTitle").textContent=`${roleName} account`;
  $("authSubtitle").textContent=isSignup?`Create your ${roleName} account.`:`Sign in to your ${roleName} account.`;
  $("loginRoleHint").textContent=isShop?"Shop account":"Admin account";
  $("confirmPasswordField").classList.toggle("hidden",!isSignup);
  $("confirmPassword").required=isSignup;
  $("loginPassword").autocomplete=isSignup?"new-password":"current-password";
  $("loginSubmit").innerHTML=isSignup?"Create account <span aria-hidden=\"true\">→</span>":"Log in <span aria-hidden=\"true\">→</span>";
  $("forgotPasswordBtn").classList.toggle("hidden",isSignup);
  $("demoCredentials").classList.toggle("hidden",isSignup);
  $("demoCredentials").textContent=isShop?"Demo: shopowner / owner123":"Demo: admin / admin123";
  $("authModeToggle").textContent=isSignup?"Back to log in":`Create ${isShop?"a":"an"} ${roleName} account`;
  document.querySelectorAll("[data-auth-tab]").forEach(button=>{
    const active=button.dataset.authTab===(isShop?"vendor":"admin");
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  $("loginError").textContent="";
  $("loginError").classList.add("hidden");
}
function handleLoginSubmit(event){
  event.preventDefault();
  const username=$("loginUsername").value.trim().toLowerCase();
  const password=$("loginPassword").value;
  const error=$("loginError");
  const showError=message=>{error.textContent=message;error.classList.remove("hidden")};
  if(!username||!password){showError("Enter your email or username and password.");return}
  if(authMode==="signup"){
    if(username.length<3){showError("Use at least 3 characters for your email or username.");return}
    if(password.length<6){showError("Use a password with at least 6 characters.");return}
    if(password!==$("confirmPassword").value){showError("Your passwords do not match.");return}
    if(accounts.some(account=>account.role===selectedAuthRole&&account.username===username)){
      showError("That email or username is already registered for this account type.");
      return;
    }
    accounts.push({role:selectedAuthRole,username,password});
    try{
      localStorage.setItem(ACCOUNTS_STORAGE_KEY,JSON.stringify(accounts));
    }catch(storageError){
      accounts.pop();
      showError("Your account could not be saved in this browser. Check browser storage and try again.");
      return;
    }
  }else if(!accounts.some(account=>account.role===selectedAuthRole&&account.username===username&&account.password===password)
    &&!(LOGIN_CREDENTIALS[selectedAuthRole]?.username===username&&LOGIN_CREDENTIALS[selectedAuthRole]?.password===password)){
    showError("Incorrect email/username or password. Please try again.");
    $("loginPassword").value="";
    $("loginPassword").focus();
    return;
  }
  $("loginUsername").value="";
  $("loginPassword").value="";
  $("confirmPassword").value="";
  applyRole(selectedAuthRole);
}
document.querySelectorAll("[data-auth-tab]").forEach(button=>button.onclick=()=>{
  selectedAuthRole=button.dataset.authTab==="vendor"?"souvenir":"rgo";
  $("loginUsername").value="";
  $("loginPassword").value="";
  $("confirmPassword").value="";
  updateLoginTabs();
});
$("authModeToggle").onclick=()=>{
  authMode=authMode==="login"?"signup":"login";
  $("loginUsername").value="";
  $("loginPassword").value="";
  $("confirmPassword").value="";
  updateLoginTabs();
};
$("loginForm").onsubmit=handleLoginSubmit;
$("logoutBtn").onclick=()=>applyRole(null);
$("downloadInventoryReport").onclick=()=>downloadReportCsv("shopInventoryReport","inventory-report");
$("downloadFinancialReport").onclick=()=>downloadReportCsv("quarterlyFinancialReport","financial-statement");
document.querySelectorAll("[data-admin-view]").forEach(button=>button.onclick=()=>activateAdminView(button.dataset.adminView));
["sidebarAddShop","overviewAddShop"].forEach(id=>$(id).onclick=()=>selectShop("__add_shop__"));
$("adminNotifications").onclick=()=>{renderNotifications();openModal("notificationModal")};
$("documentsBtn").onclick=()=>{renderDocuments("staff");openModal("staffDocumentsModal")};
$("openSalesHistory").onclick=()=>{renderSales();openModal("salesModal")};
$("manageShopInventory").onclick=()=>{if(state.reportShopId==="__all_shops__"){showToast("Select a shop before managing its products");return}renderInventory();openModal("inventoryModal")};
$("forgotPasswordBtn").onclick=()=>{const error=$("loginError");error.textContent="Demo password recovery is not available. Contact your system administrator.";error.classList.remove("hidden")};
$("printDailySalesReport").onclick=()=>window.print();
window.addEventListener("afterprint",()=>document.body.classList.remove("print-quarterly"));
$("printFinancialReport").onclick=()=>{
  document.body.classList.add("print-quarterly");
  window.print();
};
$("paymentReminderForm").onsubmit=addPaymentReminder;
$("documentFile").onchange=event=>{saveUploadedDocument(event.target.files[0],$("documentCategory").value);event.target.value=""};
$("staffDocumentFile").onchange=event=>{saveUploadedDocument(event.target.files[0],$("staffDocumentCategory").value);event.target.value=""};
$("documentCategoryFilter").onchange=()=>renderDocuments("admin");
$("userForm").onsubmit=createAccount;
$("settingsForm").onsubmit=saveSettings;
$("lowStockThreshold").value=String(lowStockThreshold);
$("financialReportYear").value=String(new Date().getFullYear());
$("financialReportQuarter").value=String(Math.floor(new Date().getMonth()/3)+1);
$("financialReportYear").onchange=renderReportsOverview;
$("financialReportQuarter").onchange=renderReportsOverview;
if($("financialReportDate")){
  $("financialReportDate").value=dateKey(new Date());
  $("financialReportDate").onchange=()=>{loadDailyReportDetails();renderReportsOverview()};
}
dailyReportInputIds.forEach(id=>{
  $(id).oninput=()=>{saveDailyReportDetails();renderReportsOverview()};
});
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));document.querySelectorAll(".modal").forEach(m=>m.onclick=e=>{if(e.target===m)closeModal(m.id)});
if($("shopSelect"))$("shopSelect").onchange=event=>selectShop(event.target.value);
["rgoReportFrom","rgoReportTo"].forEach(id=>{
  $(id).value=dateKey(new Date());
  $(id).onchange=()=>{renderReportsOverview();renderAdminDashboard()};
});
if($("reminderDueDate"))$("reminderDueDate").value=dateKey(new Date());
if($("addShopForm"))$("addShopForm").onsubmit=addShop;
window.addEventListener("storage",event=>{
  if(event.key===SHOPS_STORAGE_KEY&&event.newValue)refreshFromStoredShops(event.newValue);
});
function updateClock(){els.clock.textContent=new Date().toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})}setInterval(updateClock,1000);updateClock();
renderShopSelector();
saveData();
if(needsDefaultBarcodeMigration){
  try{localStorage.setItem(DEFAULT_BARCODE_MIGRATION_KEY,"1")}
  catch(storageError){console.error("Could not save the default barcode migration marker.",storageError)}
}
renderCategories();renderProducts();renderRegisteredProducts();renderCart();renderInventory();renderSales();
updateLoginTabs();
renderAccounts();
applyRole(state.role);

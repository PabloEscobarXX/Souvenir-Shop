const DEFAULT_PRODUCTS = [
  { id: crypto.randomUUID(), name: "Manila Ref Magnet", category: "Magnets", price: 120, stock: 25, image: "assets/magnet.svg" },
  { id: crypto.randomUUID(), name: "Philippines Keychain", category: "Keychains", price: 80, stock: 30, image: "assets/keychain.svg" },
  { id: crypto.randomUUID(), name: "Jeepney Miniature", category: "Decor", price: 350, stock: 12, image: "assets/jeepney.svg" },
  { id: crypto.randomUUID(), name: "I ❤️ Manila Shirt", category: "Shirts", price: 450, stock: 18, image: "assets/shirt.svg" },
  { id: crypto.randomUUID(), name: "Woven Coin Purse", category: "Bags", price: 150, stock: 20, image: "assets/purse.svg" },
  { id: crypto.randomUUID(), name: "Wooden Carabao", category: "Decor", price: 280, stock: 8, image: "assets/carabao.svg" },
  { id: crypto.randomUUID(), name: "Philippines Tote Bag", category: "Bags", price: 250, stock: 15, image: "assets/tote.svg" },
  { id: crypto.randomUUID(), name: "Postcard Set", category: "Stationery", price: 100, stock: 35, image: "assets/postcard.svg" }
];

const fallbackImages = ["assets/magnet.svg","assets/keychain.svg","assets/jeepney.svg","assets/shirt.svg","assets/purse.svg","assets/carabao.svg","assets/tote.svg","assets/postcard.svg"];

const state = {
  products: JSON.parse(localStorage.getItem("likha_pos_products")) || DEFAULT_PRODUCTS,
  sales: JSON.parse(localStorage.getItem("likha_pos_sales")) || [],
  cart: [],
  category: "All",
  search: ""
};

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
function saveData(){localStorage.setItem("likha_pos_products",JSON.stringify(state.products));localStorage.setItem("likha_pos_sales",JSON.stringify(state.sales))}
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
  const filtered=state.products.filter(p=>(state.category==="All"||p.category===state.category)&&(p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)));
  els.productCountText.textContent=`${filtered.length} product${filtered.length===1?"":"s"} available`;
  if(!filtered.length){els.productGrid.innerHTML=`<div class="empty-state"><div class="empty-icon">🔎</div><strong>No products found</strong><span>Try another search or category.</span></div>`;return}
  els.productGrid.innerHTML=filtered.map((p,i)=>{
    const cls=p.stock===0?"out":p.stock<=5?"low":"";
    const img=p.image||fallbackImages[i%fallbackImages.length];
    return `<article class="product-card">
      <div class="product-image-wrap"><img class="product-image" src="${img}" alt="${escapeHtml(p.name)}"><span class="stock-badge ${cls}">${p.stock===0?"Sold out":`${p.stock} left`}</span></div>
      <div class="product-info"><span class="category-pill">${escapeHtml(p.category)}</span><h3>${escapeHtml(p.name)}</h3>
      <div class="product-bottom"><span class="price">${peso.format(p.price)}</span><button class="add-btn" data-add="${p.id}" ${p.stock===0?"disabled":""}>+</button></div></div>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-add]").forEach(btn=>btn.onclick=()=>addToCart(btn.dataset.add));
}

function addToCart(id){
  const p=state.products.find(x=>x.id===id); if(!p||p.stock<=0)return;
  const item=state.cart.find(x=>x.productId===id); const qty=item?item.qty:0;
  if(qty>=p.stock){alert("Not enough stock available.");return}
  item?item.qty++:state.cart.push({productId:id,qty:1}); renderCart(); showToast(`${p.name} added to cart`);
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
  const items=getCartDetails(); if(!items.length){alert("Cart is empty.");return}
  const {subtotal,discount,total}=getTotals(),method=els.paymentMethod.value,cash=Number(els.cashInput.value)||0;
  if(method==="Cash"&&cash<total){alert("Cash received is not enough.");return}
  for(const i of items){const p=state.products.find(x=>x.id===i.productId);if(!p||p.stock<i.qty){alert(`Insufficient stock for ${i.product?.name||"an item"}.`);return}}
  items.forEach(i=>state.products.find(x=>x.id===i.productId).stock-=i.qty);
  const sale={id:`OR-${Date.now().toString().slice(-8)}`,date:new Date().toISOString(),items:items.map(i=>({productId:i.productId,name:i.product.name,price:i.product.price,qty:i.qty,lineTotal:i.lineTotal})),subtotal,discount,total,paymentMethod:method,cashReceived:method==="Cash"?cash:total,change:method==="Cash"?Math.max(cash-total,0):0};
  state.sales.unshift(sale);saveData();clearCart();renderProducts();renderInventory();renderSales();showReceipt(sale);
}
function renderInventory(){
  if(!state.products.length){els.inventoryTable.innerHTML=`<tr><td colspan="5">No products.</td></tr>`;return}
  els.inventoryTable.innerHTML=state.products.map(p=>`<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category)}</td><td>${peso.format(p.price)}</td><td>${p.stock}</td><td><button class="small-btn" data-edit="${p.id}">Edit</button> <button class="small-btn danger-text" data-delete="${p.id}">Delete</button></td></tr>`).join("");
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editProduct(b.dataset.edit)); document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteProduct(b.dataset.delete));
}
function editProduct(id){const p=state.products.find(x=>x.id===id);if(!p)return;$("productId").value=p.id;$("productName").value=p.name;$("productCategory").value=p.category;$("productPrice").value=p.price;$("productStock").value=p.stock}
function resetProductForm(){$("productForm").reset();$("productId").value=""}
function saveProduct(e){
  e.preventDefault(); const id=$("productId").value,name=$("productName").value.trim(),category=$("productCategory").value.trim(),price=Number($("productPrice").value),stock=Number($("productStock").value);
  if(!name||!category||price<0||stock<0)return;
  if(id){const p=state.products.find(x=>x.id===id);if(p)Object.assign(p,{name,category,price,stock})}
  else state.products.push({id:crypto.randomUUID(),name,category,price,stock,image:fallbackImages[state.products.length%fallbackImages.length]});
  saveData();resetProductForm();renderCategories();renderProducts();renderInventory();showToast("Product saved");
}
function deleteProduct(id){const p=state.products.find(x=>x.id===id);if(!p||!confirm(`Delete "${p.name}"?`))return;state.products=state.products.filter(x=>x.id!==id);state.cart=state.cart.filter(x=>x.productId!==id);saveData();renderCategories();renderProducts();renderInventory();renderCart()}
function renderSales(){
  els.salesCount.textContent=state.sales.length;els.salesRevenue.textContent=peso.format(state.sales.reduce((s,x)=>s+x.total,0));
  if(!state.sales.length){els.salesTable.innerHTML=`<tr><td colspan="6">No sales yet.</td></tr>`;return}
  els.salesTable.innerHTML=state.sales.map(s=>`<tr><td>${s.id}</td><td>${new Date(s.date).toLocaleString("en-PH")}</td><td>${s.items.reduce((a,b)=>a+b.qty,0)}</td><td>${s.paymentMethod}</td><td>${peso.format(s.total)}</td><td><button class="small-btn" data-receipt="${s.id}">View</button></td></tr>`).join("");
  document.querySelectorAll("[data-receipt]").forEach(b=>b.onclick=()=>{const s=state.sales.find(x=>x.id===b.dataset.receipt);if(s)showReceipt(s)});
}
function showReceipt(sale){
  els.receiptContent.innerHTML=`<div class="receipt"><h2>LIKHA SOUVENIR SHOP</h2><p>Memories made local 🇵🇭</p><hr>
  <div class="receipt-row"><span>Receipt</span><span>${sale.id}</span></div><div class="receipt-row"><span>Date</span><span>${new Date(sale.date).toLocaleString("en-PH")}</span></div><div class="receipt-row"><span>Payment</span><span>${sale.paymentMethod}</span></div><hr>
  ${sale.items.map(i=>`<div class="receipt-item"><div>${escapeHtml(i.name)}</div><small><span>${i.qty} × ${peso.format(i.price)}</span><span>${peso.format(i.lineTotal)}</span></small></div>`).join("")}<hr>
  <div class="receipt-row"><span>Subtotal</span><span>${peso.format(sale.subtotal)}</span></div><div class="receipt-row"><span>Discount</span><span>${peso.format(sale.discount)}</span></div><div class="receipt-row"><strong>TOTAL</strong><strong>${peso.format(sale.total)}</strong></div><div class="receipt-row"><span>Paid</span><span>${peso.format(sale.cashReceived)}</span></div><div class="receipt-row"><span>Change</span><span>${peso.format(sale.change)}</span></div><hr><p>Salamat! Please come again.</p></div>`;
  openModal("receiptModal");
}
function openModal(id){$(id).classList.remove("hidden")} function closeModal(id){$(id).classList.add("hidden")}

els.searchInput.oninput=e=>{state.search=e.target.value;renderProducts()}; els.discountInput.oninput=renderCart; els.discountType.onchange=renderCart; els.cashInput.oninput=updateChange;
document.querySelectorAll(".pay-method").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".pay-method").forEach(x=>x.classList.remove("active"));btn.classList.add("active");els.paymentMethod.value=btn.dataset.method;updateChange()});
$("clearCartBtn").onclick=clearCart;$("checkoutBtn").onclick=checkout;$("inventoryBtn").onclick=()=>{renderInventory();openModal("inventoryModal")};$("salesBtn").onclick=()=>{renderSales();openModal("salesModal")};
$("productForm").onsubmit=saveProduct;$("resetProductForm").onclick=resetProductForm;$("printReceiptBtn").onclick=()=>window.print();
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));document.querySelectorAll(".modal").forEach(m=>m.onclick=e=>{if(e.target===m)closeModal(m.id)});
function updateClock(){els.clock.textContent=new Date().toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})}setInterval(updateClock,1000);updateClock();
saveData();renderCategories();renderProducts();renderCart();renderInventory();renderSales();

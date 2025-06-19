// Global variables
let products = [];
let categories = [];
let suppliers = [];
let currentFilter = { category: '', lowStock: false };

// API Base URL
const API_BASE = '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
});

// Setup event listeners
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const section = e.target.dataset.section;
            showSection(section);
        });
    });

    // Forms
    document.getElementById('productFormElement').addEventListener('submit', handleProductSubmit);
    document.getElementById('categoryFormElement').addEventListener('submit', handleCategorySubmit);
    document.getElementById('supplierFormElement').addEventListener('submit', handleSupplierSubmit);

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

// Check authentication status
async function checkAuthentication() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = '/index.html';
            return;
        }
        
        // User is authenticated, update UI and load app
        document.getElementById('welcomeUser').textContent = `Welcome, ${data.username}`;
        initializeApp();
        setupEventListeners();
    } catch (error) {
        window.location.href = '/index.html';
    }
}

// Initialize the application
async function initializeApp() {
    showNotification('Loading application...', 'success');
    try {
        await Promise.all([
            loadCategories(),
            loadSuppliers(),
            loadProducts(),
            loadStats()
        ]);
        showNotification('Application loaded successfully!', 'success');
    } catch (error) {
        if (error.message.includes('Authentication required')) {
            window.location.href = '/auth.html';
        } else {
            showNotification('Error loading application: ' + error.message, 'error');
        }
    }
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API Request failed:', error);
        if (error.message.includes('Authentication required')) {
            window.location.href = '/auth.html';
        }
        throw error;
    }
}

// Load data functions
async function loadProducts() {
    try {
        const queryParams = new URLSearchParams();
        if (currentFilter.category) queryParams.append('category', currentFilter.category);
        if (currentFilter.lowStock) queryParams.append('lowStock', 'true');
        
        products = await apiRequest(`/products?${queryParams}`);
        renderProductsTable();
    } catch (error) {
        showNotification('Error loading products: ' + error.message, 'error');
    }
}

async function loadCategories() {
    try {
        categories = await apiRequest('/categories');
        renderCategoriesTable();
        populateCategoryDropdowns();
    } catch (error) {
        showNotification('Error loading categories: ' + error.message, 'error');
    }
}

async function loadSuppliers() {
    try {
        suppliers = await apiRequest('/suppliers');
        renderSuppliersTable();
        populateSupplierDropdowns();
    } catch (error) {
        showNotification('Error loading suppliers: ' + error.message, 'error');
    }
}

async function loadStats() {
    try {
        const stats = await apiRequest('/stats');
        document.getElementById('totalProducts').textContent = stats.totalProducts;
        document.getElementById('totalCategories').textContent = stats.totalCategories;
        document.getElementById('totalSuppliers').textContent = stats.totalSuppliers;
        document.getElementById('lowStockProducts').textContent = stats.lowStockProducts;
        document.getElementById('totalStockValue').textContent = `$${stats.totalStockValue.toFixed(2)}`;
    } catch (error) {
        showNotification('Error loading statistics: ' + error.message, 'error');
    }
}

// Render functions
function renderProductsTable() {
    const tbody = document.getElementById('productsTableBody');
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No products found</td></tr>';
        return;
    }

    tbody.innerHTML = products.map(product => {
        const price = parseFloat(product.price) || 0;
        const quantity = parseInt(product.quantity) || 0;
        const stockValue = (quantity * price).toFixed(2);
        const isLowStock = quantity < 5;
        const dateAdded = new Date(product.date_added).toLocaleDateString();
        
        return `
            <tr class="${isLowStock ? 'low-stock' : ''}">
                <td>${escapeHtml(product.product_name)}</td>
                <td>${escapeHtml(product.category_name || 'N/A')}</td>
                <td>${escapeHtml(product.supplier_name || 'N/A')}</td>
                <td>${quantity}${isLowStock ? ' ⚠️' : ''}</td>
                <td>$${price.toFixed(2)}</td>
                <td>$${stockValue}</td>
                <td>${dateAdded}</td>
                <td>
                    <button class="btn btn-edit" onclick="editProduct('${product.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="deleteProduct('${product.id}')">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderCategoriesTable() {
    const tbody = document.getElementById('categoriesTableBody');
    
    if (categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="loading">No categories found</td></tr>';
        return;
    }

    tbody.innerHTML = categories.map(category => `
        <tr>
            <td>${escapeHtml(category.category_name)}</td>
            <td>${escapeHtml(category.description)}</td>
            <td>
                <button class="btn btn-edit" onclick="editCategory('${category.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteCategory('${category.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function renderSuppliersTable() {
    const tbody = document.getElementById('suppliersTableBody');
    
    if (suppliers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">No suppliers found</td></tr>';
        return;
    }

    tbody.innerHTML = suppliers.map(supplier => `
        <tr>
            <td>${escapeHtml(supplier.supplier_name)}</td>
            <td>${escapeHtml(supplier.contact_email)}</td>
            <td>${escapeHtml(supplier.phone_number)}</td>
            <td>
                <button class="btn btn-edit" onclick="editSupplier('${supplier.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteSupplier('${supplier.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

// Populate dropdowns
function populateCategoryDropdowns() {
    const selects = ['productCategory', 'categoryFilter'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        // Save current value
        const currentValue = select.value;
        
        // Clear and repopulate
        const firstOption = select.querySelector('option');
        select.innerHTML = '';
        if (firstOption) select.appendChild(firstOption);
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.category_name;
            select.appendChild(option);
        });
        
        // Restore value
        select.value = currentValue;
    });
}

function populateSupplierDropdowns() {
    const select = document.getElementById('productSupplier');
    if (!select) return;
    
    const currentValue = select.value;
    const firstOption = select.querySelector('option');
    select.innerHTML = '';
    if (firstOption) select.appendChild(firstOption);
    
    suppliers.forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier.id;
        option.textContent = supplier.supplier_name;
        select.appendChild(option);
    });
    
    select.value = currentValue;
}

// Navigation
function showSection(sectionName) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Show section
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionName).classList.add('active');
    
    // Load data if needed
    if (sectionName === 'dashboard') {
        loadStats();
    }
}

// Product functions
function showProductForm() {
    document.getElementById('productFormTitle').textContent = 'Add New Product';
    document.getElementById('productFormElement').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productForm').style.display = 'block';
}

function hideProductForm() {
    document.getElementById('productForm').style.display = 'none';
}

async function handleProductSubmit(e) {
    e.preventDefault();
    
    const formData = {
        productName: document.getElementById('productName').value.trim(),
        categoryId: document.getElementById('productCategory').value,
        supplierId: document.getElementById('productSupplier').value,
        quantity: parseInt(document.getElementById('productQuantity').value),
        price: parseFloat(document.getElementById('productPrice').value)
    };
    
    // Validation
    if (!formData.productName || !formData.categoryId || !formData.supplierId) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    if (formData.quantity < 0 || formData.price < 0) {
        showNotification('Quantity and price must be non-negative', 'error');
        return;
    }
    
    try {
        const productId = document.getElementById('productId').value;
        
        if (productId) {
            // Update existing product
            await apiRequest(`/products/${productId}`, {
                method: 'PUT',
                body: JSON.stringify(formData)
            });
            showNotification('Product updated successfully!', 'success');
        } else {
            // Create new product
            await apiRequest('/products', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            showNotification('Product added successfully!', 'success');
        }
        
        hideProductForm();
        await Promise.all([loadProducts(), loadStats()]);
    } catch (error) {
        showNotification('Error saving product: ' + error.message, 'error');
    }
}

async function editProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) {
        showNotification('Product not found', 'error');
        return;
    }
    
    document.getElementById('productFormTitle').textContent = 'Edit Product';
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.product_name;
    document.getElementById('productCategory').value = product.category_id;
    document.getElementById('productSupplier').value = product.supplier_id;
    document.getElementById('productQuantity').value = parseInt(product.quantity) || 0;
    document.getElementById('productPrice').value = parseFloat(product.price) || 0;
    
    document.getElementById('productForm').style.display = 'block';
}

async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) {
        return;
    }
    
    try {
        await apiRequest(`/products/${productId}`, { method: 'DELETE' });
        showNotification('Product deleted successfully!', 'success');
        await Promise.all([loadProducts(), loadStats()]);
    } catch (error) {
        showNotification('Error deleting product: ' + error.message, 'error');
    }
}

// Category functions
function showCategoryForm() {
    document.getElementById('categoryFormTitle').textContent = 'Add New Category';
    document.getElementById('categoryFormElement').reset();
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryForm').style.display = 'block';
}

function hideCategoryForm() {
    document.getElementById('categoryForm').style.display = 'none';
}

async function handleCategorySubmit(e) {
    e.preventDefault();
    
    const formData = {
        categoryName: document.getElementById('categoryName').value.trim(),
        description: document.getElementById('categoryDescription').value.trim()
    };
    
    if (!formData.categoryName || !formData.description) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const categoryId = document.getElementById('categoryId').value;
        
        if (categoryId) {
            await apiRequest(`/categories/${categoryId}`, {
                method: 'PUT',
                body: JSON.stringify(formData)
            });
            showNotification('Category updated successfully!', 'success');
        } else {
            await apiRequest('/categories', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            showNotification('Category added successfully!', 'success');
        }
        
        hideCategoryForm();
        await Promise.all([loadCategories(), loadStats()]);
    } catch (error) {
        showNotification('Error saving category: ' + error.message, 'error');
    }
}

async function editCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) {
        showNotification('Category not found', 'error');
        return;
    }
    
    document.getElementById('categoryFormTitle').textContent = 'Edit Category';
    document.getElementById('categoryId').value = category.id;
    document.getElementById('categoryName').value = category.category_name;
    document.getElementById('categoryDescription').value = category.description;
    
    document.getElementById('categoryForm').style.display = 'block';
}

async function deleteCategory(categoryId) {
    if (!confirm('Are you sure you want to delete this category? This will fail if there are products using this category.')) {
        return;
    }
    
    try {
        await apiRequest(`/categories/${categoryId}`, { method: 'DELETE' });
        showNotification('Category deleted successfully!', 'success');
        await Promise.all([loadCategories(), loadStats()]);
    } catch (error) {
        showNotification('Error deleting category: ' + error.message, 'error');
    }
}

// Supplier functions
function showSupplierForm() {
    document.getElementById('supplierFormTitle').textContent = 'Add New Supplier';
    document.getElementById('supplierFormElement').reset();
    document.getElementById('supplierId').value = '';
    document.getElementById('supplierForm').style.display = 'block';
}

function hideSupplierForm() {
    document.getElementById('supplierForm').style.display = 'none';
}

async function handleSupplierSubmit(e) {
    e.preventDefault();
    
    const formData = {
        supplierName: document.getElementById('supplierName').value.trim(),
        contactEmail: document.getElementById('supplierEmail').value.trim(),
        phoneNumber: document.getElementById('supplierPhone').value.trim()
    };
    
    if (!formData.supplierName || !formData.contactEmail || !formData.phoneNumber) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.contactEmail)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }
    
    try {
        const supplierId = document.getElementById('supplierId').value;
        
        if (supplierId) {
            await apiRequest(`/suppliers/${supplierId}`, {
                method: 'PUT',
                body: JSON.stringify(formData)
            });
            showNotification('Supplier updated successfully!', 'success');
        } else {
            await apiRequest('/suppliers', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            showNotification('Supplier added successfully!', 'success');
        }
        
        hideSupplierForm();
        await Promise.all([loadSuppliers(), loadStats()]);
    } catch (error) {
        showNotification('Error saving supplier: ' + error.message, 'error');
    }
}

async function editSupplier(supplierId) {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) {
        showNotification('Supplier not found', 'error');
        return;
    }
    
    document.getElementById('supplierFormTitle').textContent = 'Edit Supplier';
    document.getElementById('supplierId').value = supplier.id;
    document.getElementById('supplierName').value = supplier.supplier_name;
    document.getElementById('supplierEmail').value = supplier.contact_email;
    document.getElementById('supplierPhone').value = supplier.phone_number;
    
    document.getElementById('supplierForm').style.display = 'block';
}

async function deleteSupplier(supplierId) {
    if (!confirm('Are you sure you want to delete this supplier? This will fail if there are products from this supplier.')) {
        return;
    }
    
    try {
        await apiRequest(`/suppliers/${supplierId}`, { method: 'DELETE' });
        showNotification('Supplier deleted successfully!', 'success');
        await Promise.all([loadSuppliers(), loadStats()]);
    } catch (error) {
        showNotification('Error deleting supplier: ' + error.message, 'error');
    }
}

// Filter functions
function filterProducts() {
    currentFilter.category = document.getElementById('categoryFilter').value;
    loadProducts();
}

function toggleLowStock() {
    currentFilter.lowStock = !currentFilter.lowStock;
    const btn = event.target;
    btn.textContent = currentFilter.lowStock ? 'Show All Products' : 'Show Low Stock Only';
    btn.style.background = currentFilter.lowStock ? '#e74c3c' : '#95a5a6';
    loadProducts();
}

function showLowStockProducts() {
    currentFilter.lowStock = true;
    currentFilter.category = '';
    document.getElementById('categoryFilter').value = '';
    loadProducts();
}

function showAllProducts() {
    currentFilter.lowStock = false;
    currentFilter.category = '';
    document.getElementById('categoryFilter').value = '';
    loadProducts();
}

// Utility functions
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Logout function
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/auth.html';
    } catch (error) {
        showNotification('Error logging out', 'error');
    }
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

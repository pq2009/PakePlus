// ==================== 快递单信息提取应用 ====================

// 设置pdf.js worker路径
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

// ==================== DOM元素引用 ====================
const elements = {
    // 上传相关
    fileInput: document.getElementById('fileInput'),
    dropArea: document.getElementById('dropArea'),
    
    // 按钮
    extractBtn: document.getElementById('extractBtn'),
    clearBtn: document.getElementById('clearBtn'),
    copyBtn: document.getElementById('copyBtn'),
    exportExcelBtn: document.getElementById('exportExcelBtn'),
    
    // 显示区域
    resultBox: document.getElementById('resultBox'),
    fileInfoCard: document.getElementById('fileInfoCard'),
    statusMessage: document.getElementById('statusMessage'),
    
    // 文件信息
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    pageCount: document.getElementById('pageCount'),
    
    // 选项
    appendExtToName: document.getElementById('appendExtToName'),
    appendExtToAddress: document.getElementById('appendExtToAddress'),
    
    // 加载动画
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText')
};

// ==================== 应用状态 ====================
const appState = {
    currentFiles: [],       // 当前选择的文件列表
    extractedData: [],      // PDF原始提取数据
    orderData: [],          // 解析后的订单数据
    extractedText: '',
    totalPages: 0           // 总页数
};

// ==================== 工具函数 ====================

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 显示状态消息
 */
function showStatus(message, type = 'info') {
    const iconMap = {
        success: '✓',
        warning: '⚠',
        error: '✕',
        info: 'ℹ'
    };
    
    elements.statusMessage.innerHTML = `
        <span class="status-icon">${iconMap[type]}</span>
        <span>${message}</span>
    `;
    elements.statusMessage.className = `status-message status-${type}`;
    elements.statusMessage.classList.remove('hidden');
    
    // 自动隐藏成功消息
    if (type === 'success') {
        setTimeout(() => {
            elements.statusMessage.classList.add('hidden');
        }, 5000);
    }
}

/**
 * 显示加载动画
 */
function showLoading(text = '正在处理...') {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.classList.remove('hidden');
}

/**
 * 隐藏加载动画
 */
function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
}

/**
 * 更新按钮状态
 */
function updateButtonStates(hasData = false) {
    elements.extractBtn.disabled = appState.currentFiles.length === 0;
    elements.copyBtn.disabled = !hasData;
    elements.exportExcelBtn.disabled = !hasData;
}

// ==================== PDF处理函数 ====================

/**
 * 处理上传的PDF文件（支持多文件）
 */
async function handleFiles(files) {
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
        showStatus('请选择PDF文件', 'error');
        return;
    }
    
    // 检查文件大小限制（单个文件最大50MB，总大小最大200MB）
    const MAX_SINGLE_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB
    
    const totalSize = pdfFiles.reduce((sum, f) => sum + f.size, 0);
    const oversizedFiles = pdfFiles.filter(f => f.size > MAX_SINGLE_FILE_SIZE);
    
    if (oversizedFiles.length > 0) {
        showStatus(`文件过大: ${oversizedFiles[0].name} (最大支持50MB)`, 'error');
        return;
    }
    
    if (totalSize > MAX_TOTAL_SIZE) {
        showStatus(`文件总大小超过限制 (最大支持200MB)`, 'error');
        return;
    }
    
    appState.currentFiles = pdfFiles;
    
    // 显示文件信息
    elements.fileName.textContent = pdfFiles.length === 1 
        ? pdfFiles[0].name 
        : `${pdfFiles.length} 个文件`;
    elements.fileSize.textContent = formatFileSize(totalSize);
    elements.pageCount.textContent = '-';
    elements.fileInfoCard.classList.remove('hidden');
    
    // 更新结果显示
    elements.resultBox.innerHTML = `
        <div class="result-empty">
            <div>
                <div style="font-size: 2rem; margin-bottom: 1rem;">📦</div>
                <div>已选择 ${pdfFiles.length} 个PDF文件</div>
                <div>文件名: ${pdfFiles.map(f => f.name).join(', ')}</div>
                <div style="margin-top: 1rem; color: var(--primary-color);">点击"提取内容"按钮开始提取订单信息</div>
            </div>
        </div>
    `;
    
    updateButtonStates(false);
    showStatus(`已选择 ${pdfFiles.length} 个PDF文件`, 'success');
}

/**
 * 提取所有PDF文本内容并解析订单信息（支持多文件）
 */
async function extractTextFromPDF() {
    if (appState.currentFiles.length === 0) return;
    
    showLoading('正在处理PDF文件...');
    elements.extractBtn.disabled = true;
    
    const allExtractedData = [];
    let totalPages = 0;
    let hasText = false;
    const pdfDocuments = []; // 用于追踪需要销毁的PDF文档
    
    try {
        // 处理每个PDF文件
        for (let fileIndex = 0; fileIndex < appState.currentFiles.length; fileIndex++) {
            const file = appState.currentFiles[fileIndex];
            elements.loadingText.textContent = `正在处理文件 ${fileIndex + 1}/${appState.currentFiles.length}: ${file.name}`;
            
            const arrayBuffer = await file.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuffer);
            const pdf = await pdfjsLib.getDocument(typedArray).promise;
            
            // 保存PDF文档引用以便后续清理
            pdfDocuments.push(pdf);
            
            // 逐页提取
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // 使用数组收集文本，提高性能
                const textParts = [];
                
                // 处理文本项
                for (const item of textContent.items) {
                    if (item.str && item.str.trim().length > 0) {
                        textParts.push(item.str);
                        hasText = true;
                    }
                }
                
                // 保存页面数据
                const pageData = {
                    page: totalPages + pageNum,
                    fileName: file.name,
                    fileIndex: fileIndex + 1,
                    text: textParts.join(' ').trim()
                };
                
                allExtractedData.push(pageData);
                
                // 清理页面对象（可选，PDF.js会自动管理）
                page.cleanup();
                
                // 更新进度
                if (pageNum % 5 === 0 || pageNum === pdf.numPages) {
                    elements.loadingText.textContent = `文件 ${fileIndex + 1}/${appState.currentFiles.length} - 第 ${pageNum}/${pdf.numPages} 页`;
                }
            }
            
            totalPages += pdf.numPages;
        }
        
        // 保存数据
        appState.extractedData = allExtractedData;
        appState.totalPages = totalPages;
        
        // 解析订单信息
        if (hasText && window.orderParser) {
            elements.loadingText.textContent = '正在解析订单信息...';
            
            // 获取解析选项
            const options = {
                appendExtToName: elements.appendExtToName.checked,
                appendExtToAddress: elements.appendExtToAddress.checked
            };
            
            appState.orderData = window.orderParser.parseBatch(allExtractedData, options);
            
            // 显示结果
            displayOrderResults();
            
            showStatus(
                `成功处理 ${appState.currentFiles.length} 个文件，提取 ${appState.orderData.length} 条订单信息`, 
                appState.orderData.length > 0 ? 'success' : 'warning'
            );
            
            updateButtonStates(appState.orderData.length > 0);
        } else {
            showStatus('未检测到可提取的文本内容', 'warning');
            updateButtonStates(false);
        }
        
    } catch (error) {
        console.error('文本提取错误:', error);
        showStatus('文本提取失败: ' + error.message, 'error');
        elements.resultBox.textContent = '文本提取失败: ' + error.message;
    } finally {
        // 清理PDF文档对象，释放内存
        pdfDocuments.forEach(pdf => {
            try {
                pdf.destroy();
            } catch (e) {
                console.warn('PDF清理错误:', e);
            }
        });
        
        hideLoading();
        elements.extractBtn.disabled = false;
    }
}

/**
 * 显示订单解析结果（表格形式）
 */
function displayOrderResults() {
    if (!appState.orderData || appState.orderData.length === 0) {
        elements.resultBox.innerHTML = `
            <div class="result-empty">
                <div>
                    <div style="font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                    <div style="color: var(--warning);">未能识别出订单信息</div>
                    <div style="margin-top: 1rem; font-size: 0.9rem; color: var(--gray);">
                        请确认PDF格式是否正确
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    // 创建表格HTML
    let html = `
        <table class="order-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>订单号</th>
                    <th>收件人</th>
                    <th>电话号码</th>
                    <th>收货地址</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    appState.orderData.forEach((order, index) => {
        html += `
            <tr>
                <td><span class="row-number">${index + 1}</span></td>
                <td ${order.orderNumber ? '' : 'class="empty"'}>${order.orderNumber || '未识别'}</td>
                <td ${order.receiverName ? '' : 'class="empty"'}>${order.receiverName || '未识别'}</td>
                <td ${order.receiverPhone ? '' : 'class="empty"'}>${order.receiverPhone || '未识别'}</td>
                <td ${order.receiverAddress ? '' : 'class="empty"'}>${order.receiverAddress || '未识别'}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    elements.resultBox.innerHTML = html;
    
    // 保存文本格式用于复制
    let displayText = '订单号\t收件人\t电话号码\t收货地址\n';
    appState.orderData.forEach((order, index) => {
        displayText += `${order.orderNumber || '未识别'}\t${order.receiverName || '未识别'}\t${order.receiverPhone || '未识别'}\t${order.receiverAddress || '未识别'}\n`;
    });
    
    appState.extractedText = displayText;
}

/**
 * 清空所有数据和状态
 */
function clearAll() {
    // 重置状态
    appState.currentFiles = [];
    appState.extractedData = [];
    appState.extractedText = '';
    appState.orderData = [];
    appState.totalPages = 0;
    
    // 重置UI
    elements.fileInput.value = '';
    elements.fileInfoCard.classList.add('hidden');
    elements.statusMessage.classList.add('hidden');
    
    elements.resultBox.innerHTML = `
        <div class="result-empty">
            <div>
                <div style="font-size: 2rem; margin-bottom: 1rem;">📝</div>
                <div>提取的订单信息将显示在这里...</div>
            </div>
        </div>
    `;
    
    updateButtonStates(false);
    showStatus('已清空所有内容', 'info');
}

/**
 * 复制文本到剪贴板
 */
async function copyToClipboard() {
    if (!appState.extractedText) return;
    
    try {
        await navigator.clipboard.writeText(appState.extractedText);
        
        const originalText = elements.copyBtn.innerHTML;
        elements.copyBtn.innerHTML = '<span class="btn-icon">✓</span>已复制';
        elements.copyBtn.classList.add('btn-success');
        
        setTimeout(() => {
            elements.copyBtn.innerHTML = originalText;
            elements.copyBtn.classList.remove('btn-success');
            elements.copyBtn.classList.add('btn-primary');
        }, 2000);
        
        showStatus('内容已复制到剪贴板', 'success');
        
    } catch (error) {
        console.error('复制失败:', error);
        showStatus('复制失败，请手动选择文本复制', 'error');
    }
}

/**
 * 导出为Excel文件
 */
function exportToExcel() {
    if (!appState.orderData || appState.orderData.length === 0) {
        showStatus('没有可导出的数据', 'warning');
        return;
    }
    
    try {
        showLoading('正在生成Excel文件...');
        
        const excelData = [];
        
        // 添加标题行
        excelData.push([
            '序号',
            '订单号',
            '收件人',
            '电话号码',
            '收货地址'
        ]);
        
        // 添加数据行
        appState.orderData.forEach((order, index) => {
            excelData.push([
                index + 1,
                order.orderNumber || '',
                order.receiverName || '',
                order.receiverPhone || '',
                order.receiverAddress || ''
            ]);
        });
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 6 },   // 序号
            { wch: 22 },  // 订单号
            { wch: 15 },  // 收件人
            { wch: 18 },  // 电话号码
            { wch: 60 }   // 收货地址
        ];
        
        // 将工作表添加到工作簿
        XLSX.utils.book_append_sheet(wb, ws, '订单信息');
        
        // 生成文件名
        const timestamp = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const fileName = `订单信息_${timestamp}.xlsx`;
        
        // 导出Excel文件
        XLSX.writeFile(wb, fileName);
        
        hideLoading();
        showStatus(`Excel文件已导出: ${fileName}`, 'success');
        
    } catch (error) {
        console.error('Excel导出错误:', error);
        hideLoading();
        showStatus('Excel导出失败: ' + error.message, 'error');
    }
}

// ==================== 事件监听器 ====================

/**
 * 初始化拖放功能
 */
function initDragAndDrop() {
    // 点击上传区域
    elements.dropArea.addEventListener('click', () => {
        elements.fileInput.click();
    });
    
    // 文件选择（支持多文件）
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    });
    
    // 拖放事件
    elements.dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropArea.classList.add('dragover');
    });
    
    elements.dropArea.addEventListener('dragleave', () => {
        elements.dropArea.classList.remove('dragover');
    });
    
    elements.dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropArea.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });
}

/**
 * 初始化按钮事件
 */
function initButtons() {
    elements.extractBtn.addEventListener('click', extractTextFromPDF);
    elements.clearBtn.addEventListener('click', clearAll);
    elements.copyBtn.addEventListener('click', copyToClipboard);
    elements.exportExcelBtn.addEventListener('click', exportToExcel);
}

/**
 * 初始化快捷键
 */
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + E: 提取
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            if (!elements.extractBtn.disabled) {
                extractTextFromPDF();
            }
        }
        
        // Ctrl/Cmd + S: 导出Excel
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (!elements.exportExcelBtn.disabled) {
                exportToExcel();
            }
        }
        
        // Escape: 关闭加载动画
        if (e.key === 'Escape') {
            hideLoading();
        }
    });
}

// ==================== 应用初始化 ====================

/**
 * 初始化应用
 */
function initApp() {
    console.log('快递单信息提取工具初始化中...');
    
    // 检查订单解析器是否加载
    if (!window.orderParser) {
        console.error('订单解析器未加载！');
        showStatus('系统初始化失败：订单解析器未加载', 'error');
        return;
    }
    
    // 初始化各个功能模块
    initDragAndDrop();
    initButtons();
    initKeyboardShortcuts();
    
    // 设置初始状态
    updateButtonStates(false);
    
    console.log('快递单信息提取工具已就绪！');
    console.log('提示：支持快捷键 Ctrl+E (提取), Ctrl+S (导出)');
}

// ==================== 调试工具 ====================

/**
 * 测试订单解析
 */
window.testOrderParser = function(text) {
    if (!window.orderParser) {
        console.error('订单解析器未加载');
        return;
    }
    
    const testText = text || `特快 已 验 视 打印时间 2025-07-22 11:04:17 第 1/40 个 SF3198326916386 318M-036 收 陈 * *******6465 河北省衡水市景县 景州镇南环医保局 隐私 号 码 15781324910 转 0499 SF3198326916386 寄 陈先生 1 6 7 72 6 1 68 0 0 山东省临沂市罗庄区罗庄街道万泉商场沿街仓库 M6 6944573851599115696 第 1/40 个`;
    
    const result = window.orderParser.parsePageText(testText);
    
    console.group('订单解析测试');
    console.log('原始文本:', testText);
    console.log('解析结果:', result);
    console.groupEnd();
    
    return result;
};

/**
 * 显示应用信息
 */
window.appInfo = function() {
    console.group('应用信息');
    console.log('版本:', '2.0.0');
    console.log('PDF.js版本:', pdfjsLib.version);
    console.log('当前状态:', {
        已加载PDF: !!appState.currentPdf,
        PDF页数: appState.currentPdf?.numPages || 0,
        已提取订单: appState.orderData.length
    });
    console.groupEnd();
};

// ==================== 页面加载完成后初始化 ====================
document.addEventListener('DOMContentLoaded', initApp);

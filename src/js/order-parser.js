// ==================== 订单信息解析器 ====================
// 专门用于解析特定格式的快递单信息

/**
 * 订单信息解析器类
 */
class OrderParser {
    constructor() {
        // 订单号正则：69开头的19位数字
        this.orderNumberPattern = /\b69\d{17}\b/;
        
        // 电话号码正则：11位手机号 + 转 + 4位分机号
        this.phonePattern = /(\d{11})\s*转\s*(\d{4})/;
        
        // 收件人姓名正则：收字后面的姓氏
        this.receiverNamePattern = /收\s+([^\s*]+)\s+\*/;
        
        // 地址提取：从星号串到"隐私号码"之间的内容
        this.addressPattern = /\*{7}\d+\s+([^隐]*?)\s+隐私/;
    }

    /**
     * 解析单页文本
     * @param {string} text - 页面文本
     * @param {object} options - 解析选项
     * @returns {object} 解析结果
     */
    parsePageText(text, options = {}) {
        if (!text || typeof text !== 'string') {
            return null;
        }

        const result = {
            orderNumber: '',      // 订单号
            receiverName: '',     // 收件人姓名
            receiverPhone: '',    // 收件人电话
            receiverAddress: '',  // 收件地址
            extension: ''         // 分机号（内部使用）
        };

        try {
            // 1. 提取订单号（69开头的19位数字）
            const orderMatch = text.match(this.orderNumberPattern);
            if (orderMatch) {
                result.orderNumber = orderMatch[0];
            }

            // 2. 提取电话号码（11位 + 转 + 4位，无空格）
            const phoneMatch = text.match(this.phonePattern);
            if (phoneMatch) {
                result.receiverPhone = `${phoneMatch[1]}转${phoneMatch[2]}`;
                result.extension = phoneMatch[2];  // 保存分机号供后续使用
            }

            // 3. 提取收件人姓名
            const nameMatch = text.match(this.receiverNamePattern);
            if (nameMatch && nameMatch[1]) {
                const name = nameMatch[1].trim();
                
                // 基础格式：姓 + *
                // 例如：陈*、李*、千*
                result.receiverName = name + '*';
                
                // 如果用户勾选"拼接分机号到姓名"
                // 格式变为：姓 + * + [分机号]
                // 例如：陈*[0499]、李*[3594]
                if (options.appendExtToName && result.extension) {
                    result.receiverName = result.receiverName + '[' + result.extension + ']';
                }
            }

            // 4. 提取收件地址
            const addressMatch = text.match(this.addressPattern);
            if (addressMatch && addressMatch[1]) {
                // 去除多余空格
                result.receiverAddress = addressMatch[1].trim().replace(/\s+/g, '');
                
                // 如果用户勾选"拼接分机号到地址"
                // 格式：地址 + [分机号]
                // 例如：河北省衡水市景县景州镇南环医保局[0499]
                if (options.appendExtToAddress && result.extension) {
                    result.receiverAddress = result.receiverAddress + '[' + result.extension + ']';
                }
            }

        } catch (error) {
            console.error('解析错误:', error);
            return null;
        }

        return result;
    }

    /**
     * 批量解析
     * @param {array} dataArray - 包含多页数据的数组
     * @param {object} options - 解析选项
     * @returns {array} 解析结果数组
     */
    parseBatch(dataArray, options = {}) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            return [];
        }
        
        const results = [];
        
        // 使用for循环代替forEach，性能更好
        for (let i = 0; i < dataArray.length; i++) {
            const item = dataArray[i];
            const text = typeof item === 'string' ? item : item.text || '';
            
            // 跳过空文本
            if (!text || text.length === 0) {
                continue;
            }
            
            const parsed = this.parsePageText(text, options);
            
            if (parsed && parsed.orderNumber) {
                results.push({
                    page: item.page || (i + 1),
                    fileName: item.fileName || '',
                    orderNumber: parsed.orderNumber,
                    receiverName: parsed.receiverName,
                    receiverPhone: parsed.receiverPhone,
                    receiverAddress: parsed.receiverAddress
                    // 不保存raw文本，减少内存占用
                });
            }
        }
        
        return results;
    }

    /**
     * 验证订单号格式
     * @param {string} orderNumber - 订单号
     * @returns {boolean} 是否有效
     */
    isValidOrderNumber(orderNumber) {
        return this.orderNumberPattern.test(orderNumber);
    }

    /**
     * 验证电话号码格式
     * @param {string} phone - 电话号码
     * @returns {boolean} 是否有效
     */
    isValidPhone(phone) {
        return /\d{11}\s*转\s*\d{4}/.test(phone);
    }

    /**
     * 获取解析统计
     * @param {array} results - 解析结果数组
     * @returns {object} 统计信息
     */
    getStatistics(results) {
        return {
            total: results.length,
            hasOrderNumber: results.filter(r => r.orderNumber).length,
            hasName: results.filter(r => r.receiverName).length,
            hasPhone: results.filter(r => r.receiverPhone).length,
            hasAddress: results.filter(r => r.receiverAddress).length,
            complete: results.filter(r => 
                r.orderNumber && r.receiverName && r.receiverPhone && r.receiverAddress
            ).length
        };
    }
}

// ==================== 导出 ====================
// 创建全局实例
window.OrderParser = OrderParser;
window.orderParser = new OrderParser();

// 便捷函数
window.parseOrder = function(text) {
    return window.orderParser.parsePageText(text);
};

console.log('订单信息解析器已加载 ✓');

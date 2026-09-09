import { motion } from 'framer-motion';
import { ContainerData } from '@/types/container';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';

interface ExportButtonsProps {
  data: ContainerData[];
  disabled?: boolean;
}

export function ExportButtons({ data, disabled }: ExportButtonsProps) {
  const exportToExcel = async () => {
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Tracking Results');
      
      worksheet.columns = [
        { header: 'Container Number', key: 'containerNumber', width: 20 },
        { header: 'Shipping Line', key: 'shippingLine', width: 15 },
        { header: 'Current Location', key: 'currentLocation', width: 20 },
        { header: 'Vessel Name', key: 'vesselName', width: 20 },
        { header: 'Voyage Number', key: 'voyageNumber', width: 15 },
        { header: 'ETA', key: 'eta', width: 15 },
        { header: 'Last Update', key: 'lastUpdate', width: 20 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Error', key: 'error', width: 25 }
      ];
      
      data.forEach(container => {
        worksheet.addRow({
          containerNumber: container.containerNumber,
          shippingLine: container.shippingLine,
          currentLocation: container.currentLocation,
          vesselName: container.vesselName,
          voyageNumber: container.voyageNumber,
          eta: container.eta,
          lastUpdate: container.lastUpdate,
          status: container.status,
          error: container.error || ''
        });
      });
      
      worksheet.getRow(1).font = { bold: true };
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `container_tracking_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success('Excel file downloaded!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export');
    }
  };

  const exportToCSV = () => {
    try {
      const headers = [
        'Container Number', 'Shipping Line', 'Current Location', 'Vessel Name',
        'Voyage Number', 'ETA', 'Last Update', 'Status', 'Error'
      ];
      
      const rows = data.map(container => [
        container.containerNumber, container.shippingLine, container.currentLocation,
        container.vesselName, container.voyageNumber, container.eta,
        container.lastUpdate, container.status, container.error || ''
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `container_tracking_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success('CSV file downloaded!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export');
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
        <Button
          onClick={exportToExcel}
          disabled={disabled || data.length === 0}
          size="sm"
          className="gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-neu hover:shadow-neu-inset-sm font-semibold"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span className="hidden sm:inline">Excel</span>
        </Button>
      </motion.div>
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
        <Button
          onClick={exportToCSV}
          disabled={disabled || data.length === 0}
          variant="outline"
          size="sm"
          className="gap-2 rounded-2xl shadow-neu bg-card border border-white/80 dark:border-white/10 hover:shadow-neu-inset-sm font-semibold text-foreground"
        >
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">CSV</span>
        </Button>
      </motion.div>
    </div>
  );
}

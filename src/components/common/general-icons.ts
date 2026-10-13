import type { ComponentType, SVGProps } from 'react';
import { PhoneIcon } from '@phosphor-icons/react/dist/csr/Phone';
import { DeviceMobileIcon } from '@phosphor-icons/react/dist/csr/DeviceMobile';
import { EnvelopeIcon } from '@phosphor-icons/react/dist/csr/Envelope';
import { AddressBookIcon } from '@phosphor-icons/react/dist/csr/AddressBook';
import { BriefcaseIcon } from '@phosphor-icons/react/dist/csr/Briefcase';
import { StorefrontIcon } from '@phosphor-icons/react/dist/csr/Storefront';
import { ReceiptIcon } from '@phosphor-icons/react/dist/csr/Receipt';
import { ShoppingCartIcon } from '@phosphor-icons/react/dist/csr/ShoppingCart';
import { InvoiceIcon } from '@phosphor-icons/react/dist/csr/Invoice';
import { PackageIcon } from '@phosphor-icons/react/dist/csr/Package';
import { CodeIcon } from '@phosphor-icons/react/dist/csr/Code';
import { DatabaseIcon } from '@phosphor-icons/react/dist/csr/Database';
import { DesktopIcon } from '@phosphor-icons/react/dist/csr/Desktop';
import { PrinterIcon } from '@phosphor-icons/react/dist/csr/Printer';
import { FileTextIcon } from '@phosphor-icons/react/dist/csr/FileText';
import { ClipboardTextIcon } from '@phosphor-icons/react/dist/csr/ClipboardText';
import { CalendarCheckIcon } from '@phosphor-icons/react/dist/csr/CalendarCheck';
import { TicketIcon } from '@phosphor-icons/react/dist/csr/Ticket';
import { MicrophoneStageIcon } from '@phosphor-icons/react/dist/csr/MicrophoneStage';
import { AirplaneIcon } from '@phosphor-icons/react/dist/csr/Airplane';
import { BusIcon } from '@phosphor-icons/react/dist/csr/Bus';
import { StethoscopeIcon } from '@phosphor-icons/react/dist/csr/Stethoscope';
import { ScissorsIcon } from '@phosphor-icons/react/dist/csr/Scissors';
import { WrenchIcon } from '@phosphor-icons/react/dist/csr/Wrench';

export type CatalogIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
export interface IconEntry {
  icon: CatalogIcon;
  label: string;
  family?: 'Phosphor';
  keywords?: string;
}

/** Importaciones por archivo para cargar solo los iconos ofrecidos. Los ids son estables y no reemplazan Lucide. */
export const GENERAL_ICONS: Record<string, IconEntry> = {
  'phosphor-phone': { icon: PhoneIcon, label: 'Teléfono', keywords: 'contacto llamada phone' },
  'phosphor-mobile': { icon: DeviceMobileIcon, label: 'Móvil', keywords: 'teléfono celular smartphone contacto' },
  'phosphor-mail': { icon: EnvelopeIcon, label: 'Correo electrónico', keywords: 'email contacto mensaje' },
  'phosphor-contacts': { icon: AddressBookIcon, label: 'Agenda de contactos', keywords: 'persona dirección' },
  'phosphor-briefcase': { icon: BriefcaseIcon, label: 'Trabajo', keywords: 'oficina comercial negocio empresa' },
  'phosphor-store': { icon: StorefrontIcon, label: 'Comercio', keywords: 'tienda venta producto servicio' },
  'phosphor-receipt': { icon: ReceiptIcon, label: 'Recibo', keywords: 'pago compra gasto' },
  'phosphor-cart': { icon: ShoppingCartIcon, label: 'Carrito de compra', keywords: 'comercial pedido producto' },
  'phosphor-invoice': { icon: InvoiceIcon, label: 'Factura', keywords: 'pago comercial venta' },
  'phosphor-package': { icon: PackageIcon, label: 'Paquete', keywords: 'envío producto entrega' },
  'phosphor-code': { icon: CodeIcon, label: 'Código', keywords: 'programa desarrollo función software' },
  'phosphor-database': { icon: DatabaseIcon, label: 'Base de datos', keywords: 'programa servidor almacenamiento' },
  'phosphor-desktop': { icon: DesktopIcon, label: 'Ordenador', keywords: 'computadora oficina informática' },
  'phosphor-printer': { icon: PrinterIcon, label: 'Impresora', keywords: 'oficina documento papel' },
  'phosphor-document': { icon: FileTextIcon, label: 'Documento', keywords: 'archivo informe texto' },
  'phosphor-task': { icon: ClipboardTextIcon, label: 'Tarea', keywords: 'actividad requisito pendiente' },
  'phosphor-calendar': { icon: CalendarCheckIcon, label: 'Cita', keywords: 'evento calendario agenda fecha' },
  'phosphor-ticket': { icon: TicketIcon, label: 'Entrada de evento', keywords: 'asistencia reserva' },
  'phosphor-microphone': {
    icon: MicrophoneStageIcon,
    label: 'Presentación',
    keywords: 'evento charla conferencia micrófono',
  },
  'phosphor-airplane': { icon: AirplaneIcon, label: 'Avión', keywords: 'viaje transporte' },
  'phosphor-bus': { icon: BusIcon, label: 'Autobús', keywords: 'viaje transporte' },
  'phosphor-health': { icon: StethoscopeIcon, label: 'Atención médica', keywords: 'salud persona médico' },
  'phosphor-scissors': { icon: ScissorsIcon, label: 'Tijeras', keywords: 'herramienta taller' },
  'phosphor-wrench': { icon: WrenchIcon, label: 'Mantenimiento', keywords: 'herramienta reparación servicio' },
};

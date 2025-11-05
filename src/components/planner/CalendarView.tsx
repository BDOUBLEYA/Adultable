import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './calendar-custom.css';

const locales = {
  'en-US': require('date-fns/locale/en-US'),
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface Task {
  id: string;
  title: string;
  due_date: string;
  start_time?: string;
  end_time?: string;
  all_day: boolean;
  priority: string;
  category: string;
  completed: boolean;
}

interface CalendarViewProps {
  tasks: Task[];
  onSelectSlot: (slotInfo: { start: Date; end: Date }) => void;
  onSelectEvent: (task: Task) => void;
}

export default function CalendarView({ tasks, onSelectSlot, onSelectEvent }: CalendarViewProps) {
  const events = tasks.map((task) => {
    const date = new Date(task.due_date);
    let start = date;
    let end = date;

    if (!task.all_day && task.start_time && task.end_time) {
      const [startHour, startMin] = task.start_time.split(':');
      const [endHour, endMin] = task.end_time.split(':');
      
      start = new Date(date);
      start.setHours(parseInt(startHour), parseInt(startMin), 0);
      
      end = new Date(date);
      end.setHours(parseInt(endHour), parseInt(endMin), 0);
    }

    return {
      id: task.id,
      title: task.title,
      start,
      end,
      resource: task,
      allDay: task.all_day,
    };
  });

  const eventStyleGetter = (event: any) => {
    const task = event.resource as Task;
    let backgroundColor = 'hsl(var(--muted))';
    let borderColor = 'hsl(var(--border))';

    if (task.completed) {
      backgroundColor = 'hsl(var(--muted) / 0.5)';
    } else {
      switch (task.priority) {
        case 'high':
          borderColor = 'hsl(var(--primary))';
          backgroundColor = 'hsl(var(--primary) / 0.1)';
          break;
        case 'medium':
          borderColor = 'hsl(var(--muted-foreground))';
          backgroundColor = 'hsl(var(--muted))';
          break;
        case 'low':
          borderColor = 'hsl(var(--border))';
          backgroundColor = 'hsl(var(--muted) / 0.5)';
          break;
      }
    }

    return {
      style: {
        backgroundColor,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: '4px',
        opacity: task.completed ? 0.6 : 1,
        textDecoration: task.completed ? 'line-through' : 'none',
      },
    };
  };

  return (
    <div className="calendar-container h-[600px] bg-background rounded-lg border p-4">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '100%' }}
        onSelectSlot={onSelectSlot}
        onSelectEvent={(event) => onSelectEvent(event.resource)}
        selectable
        eventPropGetter={eventStyleGetter}
        views={['month', 'week', 'day']}
        defaultView="week"
      />
    </div>
  );
}

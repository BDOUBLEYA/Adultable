import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send } from "lucide-react";
import { streamChat } from "@/utils/chatStream";
import { useToast } from "@/components/ui/use-toast";

type Message = { role: "user" | "assistant"; content: string };

interface MealPlannerChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSavePlan: (planData: { name: string; budget: number; days: number; content: string }) => void;
}

export default function MealPlannerChat({ open, onOpenChange, onSavePlan }: MealPlannerChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: "Hi! I'm here to help you create a budget-friendly meal plan. Let's start with a few questions:\n\n1. What's your budget for meals?\n2. How many days would you like to plan for?\n3. Do you have any dietary preferences or restrictions?\n\nJust tell me what you're thinking!",
        },
      ]);
    }
  }, [open]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantContent = "";
    const upsertAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantContent } : m));
        }
        return [...prev, { role: "assistant", content: assistantContent }];
      });
    };

    try {
      await streamChat({
        messages: [...messages, userMsg],
        onDelta: upsertAssistant,
        onDone: () => setIsLoading(false),
        functionName: "meal-planning-chat",
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to get response",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleSavePlan = () => {
    const conversationText = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    
    // Try to extract plan details from conversation
    const planName = `Meal Plan - ${new Date().toLocaleDateString()}`;
    const budget = 100; // Default, user can edit later
    const days = 7; // Default
    
    onSavePlan({
      name: planName,
      budget,
      days,
      content: conversationText,
    });
    
    toast({
      title: "Plan Saved",
      description: "Your meal plan has been saved successfully!",
    });
    
    setMessages([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Meal Planning Assistant</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-2 pt-4 border-t">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type your message..."
            disabled={isLoading}
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
          {messages.length > 2 && (
            <Button onClick={handleSavePlan} variant="secondary">
              Save Plan
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
